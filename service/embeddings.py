from collections import OrderedDict
import hashlib
import logging
import threading
import time
from typing import List, Optional, Tuple, Dict, Any
import numpy as np

from service.models import ChunkModel, RetrievalResultModel, SearchResponse, ModelStatusResponse, EmbedResponse

logger = logging.getLogger("webrag.embeddings")

DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2"
DEFAULT_DIMENSION = 384

def compute_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

class LRUEmbeddingCache:
    """
    Thread-safe bounded LRU cache for embeddings, enforcing both item count and memory limits.
    """
    def __init__(self, max_entries: int = 5000, max_bytes: int = 20 * 1024 * 1024):
        self.max_entries = max_entries
        self.max_bytes = max_bytes
        self._cache: OrderedDict[str, np.ndarray] = OrderedDict()
        self._current_bytes: int = 0
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[np.ndarray]:
        with self._lock:
            if key not in self._cache:
                return None
            self._cache.move_to_end(key)
            return self._cache[key]

    def set(self, key: str, value: np.ndarray) -> None:
        with self._lock:
            val_bytes = value.nbytes
            if key in self._cache:
                self._current_bytes -= self._cache[key].nbytes
                del self._cache[key]

            self._cache[key] = value
            self._current_bytes += val_bytes
            self._cache.move_to_end(key)

            while len(self._cache) > self.max_entries or (self._current_bytes > self.max_bytes and len(self._cache) > 1):
                _, evicted_val = self._cache.popitem(last=False)
                self._current_bytes -= evicted_val.nbytes

    def __contains__(self, key: str) -> bool:
        with self._lock:
            return key in self._cache

    def __getitem__(self, key: str) -> np.ndarray:
        with self._lock:
            self._cache.move_to_end(key)
            return self._cache[key]

    def __setitem__(self, key: str, value: np.ndarray) -> None:
        self.set(key, value)

    def __len__(self) -> int:
        with self._lock:
            return len(self._cache)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            self._current_bytes = 0

class EmbeddingEngine:
    _instance: Optional["EmbeddingEngine"] = None
    _lock = threading.Lock()

    def __init__(self, model_name: str = DEFAULT_MODEL_NAME):
        self.model_name = model_name
        self.dimension = DEFAULT_DIMENSION
        self.device = "cpu"
        self._model = None
        self._status: str = "unloaded"
        self._cache = LRUEmbeddingCache(max_entries=5000, max_bytes=20 * 1024 * 1024)
        self._init_lock = threading.Lock()

    @classmethod
    def get_instance(cls, model_name: str = DEFAULT_MODEL_NAME) -> "EmbeddingEngine":
        with cls._lock:
            if cls._instance is None or cls._instance.model_name != model_name:
                cls._instance = cls(model_name)
            return cls._instance

    def _load_model(self):
        if self._model is not None:
            return

        with self._init_lock:
            if self._model is not None:
                return

            self._status = "loading"
            try:
                import torch
                from sentence_transformers import SentenceTransformer

                # Detect Apple Silicon MPS device if available
                if torch.backends.mps.is_available():
                    self.device = "mps"
                elif torch.cuda.is_available():
                    self.device = "cuda"
                else:
                    self.device = "cpu"

                logger.info(f"Loading local embedding model '{self.model_name}' on {self.device}...")
                self._model = SentenceTransformer(self.model_name, device=self.device)
                
                # Warm-up inference
                _ = self._model.encode(["WebRAG warm-up query"], normalize_embeddings=True, convert_to_numpy=True)
                
                self._status = "ready"
                logger.info(f"Local embedding model '{self.model_name}' is ready on {self.device}.")
            except Exception as e:
                self._status = "error"
                logger.error(f"Failed to load embedding model '{self.model_name}': {e}", exc_info=True)
                raise RuntimeError(
                    f"Could not load local embedding model '{self.model_name}'. "
                    f"Ensure dependencies are installed and the model can be downloaded locally: {e}"
                ) from e

    def get_status(self) -> ModelStatusResponse:
        return ModelStatusResponse(
            status=self._status,
            modelName=self.model_name,
            dimension=self.dimension,
            device=self.device,
            cachedEmbeddingsCount=len(self._cache),
            isLocal=True
        )

    def embed_texts(self, texts: List[str], hashes: Optional[List[str]] = None) -> Tuple[np.ndarray, int, int]:
        """
        Embeds a list of texts using the local sentence transformer model.
        Utilizes the in-memory cache for texts with known hashes.
        Returns (embeddings_matrix, cached_count, computed_count).
        """
        if not texts:
            return np.empty((0, self.dimension), dtype=np.float32), 0, 0

        self._load_model()

        if hashes is None:
            hashes = [compute_sha256(t) for t in texts]

        results = [None] * len(texts)
        uncached_indices = []
        uncached_texts = []

        cached_count = 0
        computed_count = 0

        for idx, (text, h) in enumerate(zip(texts, hashes)):
            cache_key = f"{self.model_name}:{h}"
            if cache_key in self._cache:
                results[idx] = self._cache[cache_key]
                cached_count += 1
            else:
                uncached_indices.append(idx)
                uncached_texts.append(text)

        if uncached_texts:
            new_vectors = self._model.encode(
                uncached_texts,
                normalize_embeddings=True,
                convert_to_numpy=True,
                show_progress_bar=False
            )
            # Ensure float32 and 2D
            if len(new_vectors.shape) == 1:
                new_vectors = np.expand_dims(new_vectors, axis=0)

            for idx, vec in zip(uncached_indices, new_vectors):
                # Ensure L2 normalization
                norm = np.linalg.norm(vec)
                if norm > 0:
                    vec = vec / norm
                h = hashes[idx]
                cache_key = f"{self.model_name}:{h}"
                self._cache[cache_key] = vec.astype(np.float32)
                results[idx] = self._cache[cache_key]
                computed_count += 1

        final_matrix = np.vstack(results).astype(np.float32)
        return final_matrix, cached_count, computed_count

    def embed_chunks(self, chunks: List[ChunkModel]) -> Tuple[np.ndarray, int, int]:
        texts = [c.content for c in chunks]
        hashes = [compute_sha256(c.content) for c in chunks]
        return self.embed_texts(texts, hashes)

    def search(
        self,
        query: str,
        chunks: List[ChunkModel],
        top_k: int = 5,
        strategy: Optional[str] = None,
        search_mode: str = "hybrid",
        min_score: Optional[float] = None
    ) -> SearchResponse:
        start_time = time.perf_counter()

        if not query or not query.strip():
            raise ValueError("Search query must not be empty.")

        if not chunks:
            return SearchResponse(
                query=query,
                results=[],
                latencyMs=round((time.perf_counter() - start_time) * 1000, 2),
                model=self.model_name,
                dimension=self.dimension,
                totalCandidates=0,
                searchMode=search_mode
            )

        # Filter by strategy if requested
        candidate_chunks = [c for c in chunks if strategy is None or c.strategy == strategy]
        if not candidate_chunks:
            return SearchResponse(
                query=query,
                results=[],
                latencyMs=round((time.perf_counter() - start_time) * 1000, 2),
                model=self.model_name,
                dimension=self.dimension,
                totalCandidates=0,
                searchMode=search_mode
            )

        from service.retrieval import compute_bm25_similarity

        n_candidates = len(candidate_chunks)
        dense_scores: List[float] = [0.0] * n_candidates
        bm25_scores: List[float] = [0.0] * n_candidates

        # 1. Compute Dense Cosine Similarities if requested
        if search_mode in ("dense", "hybrid"):
            query_vec_mat, _, _ = self.embed_texts([query.strip()])
            query_vec = query_vec_mat[0]  # shape: (384,)
            chunk_matrix, _, _ = self.embed_chunks(candidate_chunks)  # shape: (N, 384)
            similarities = np.dot(chunk_matrix, query_vec)
            dense_scores = [float(np.clip(s, -1.0, 1.0)) for s in similarities]

        # 2. Compute BM25 Lexical Similarities if requested
        if search_mode in ("bm25", "hybrid"):
            doc_contents = [c.content for c in candidate_chunks]
            bm25_scores = compute_bm25_similarity(query, doc_contents)

        # 3. Score & Rank based on search_mode
        scored_candidates = []

        if search_mode == "dense":
            for idx, chunk in enumerate(candidate_chunks):
                d_score = round(dense_scores[idx], 4)
                scored_candidates.append({
                    "chunk": chunk,
                    "score": d_score,
                    "denseScore": d_score,
                    "bm25Score": None,
                    "sequence": chunk.sequence,
                    "id": chunk.id
                })
            scored_candidates.sort(key=lambda item: (-item["score"], item["sequence"], item["id"]))

        elif search_mode == "bm25":
            for idx, chunk in enumerate(candidate_chunks):
                b_score = round(bm25_scores[idx], 4)
                scored_candidates.append({
                    "chunk": chunk,
                    "score": b_score,
                    "denseScore": None,
                    "bm25Score": b_score,
                    "sequence": chunk.sequence,
                    "id": chunk.id
                })
            scored_candidates.sort(key=lambda item: (-item["score"], item["sequence"], item["id"]))

        else:
            # Hybrid: Reciprocal Rank Fusion (RRF with k=60)
            def compute_ranks(scores: List[float]) -> dict:
                sorted_idx = sorted(
                    range(n_candidates),
                    key=lambda i: (-scores[i], candidate_chunks[i].sequence, candidate_chunks[i].id)
                )
                ranks = {}
                for rank_pos, cand_idx in enumerate(sorted_idx, start=1):
                    if rank_pos > 1:
                        prev_idx = sorted_idx[rank_pos - 2]
                        if abs(scores[cand_idx] - scores[prev_idx]) < 1e-5:
                            ranks[cand_idx] = ranks[prev_idx]
                            continue
                    ranks[cand_idx] = rank_pos
                return ranks

            dense_ranks = compute_ranks(dense_scores)
            bm25_ranks = compute_ranks(bm25_scores)

            # Max theoretical RRF score (rank 1 in both): 2 / 61
            max_rrf = 2.0 / 61.0

            for idx, chunk in enumerate(candidate_chunks):
                d_score = dense_scores[idx]
                b_score = bm25_scores[idx]

                # Adjust RRF so zero-signal candidates contribute nothing
                d_contrib = (1.0 / (60.0 + dense_ranks[idx])) if d_score > 0.0 else 0.0
                b_contrib = (1.0 / (60.0 + bm25_ranks[idx])) if b_score > 0.0 else 0.0
                rrf_raw = d_contrib + b_contrib

                # Normalize RRF to 0.0 - 1.0 range for consistent display and schema validation
                rrf_norm = round(min(1.0, rrf_raw / max_rrf), 4) if rrf_raw > 0.0 else 0.0

                scored_candidates.append({
                    "chunk": chunk,
                    "score": rrf_norm,
                    "denseScore": round(d_score, 4),
                    "bm25Score": round(b_score, 4),
                    "sequence": chunk.sequence,
                    "id": chunk.id
                })
            scored_candidates.sort(key=lambda item: (-item["score"], item["sequence"], item["id"]))

        # Optional threshold filtering (no-match threshold)
        if min_score is not None:
            scored_candidates = [c for c in scored_candidates if c["score"] >= min_score]

        # 4. Extract top_k results
        top_results = scored_candidates[:top_k]

        results: List[RetrievalResultModel] = []
        for rank_idx, item in enumerate(top_results, start=1):
            chunk = item["chunk"]
            raw_content = chunk.content.strip()
            if len(raw_content) > 280:
                excerpt = raw_content[:277].rstrip() + "..."
            else:
                excerpt = raw_content

            results.append(
                RetrievalResultModel(
                    chunkId=chunk.id,
                    score=item["score"],
                    rank=rank_idx,
                    strategy=chunk.strategy,
                    headingPath=chunk.headingPath or [],
                    excerpt=excerpt,
                    sourceBlockIds=chunk.sourceBlockIds or [],
                    searchMode=search_mode,
                    denseScore=item["denseScore"],
                    bm25Score=item["bm25Score"]
                )
            )

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

        return SearchResponse(
            query=query,
            results=results,
            latencyMs=latency_ms,
            model=self.model_name,
            dimension=self.dimension,
            totalCandidates=len(candidate_chunks),
            searchMode=search_mode
        )
