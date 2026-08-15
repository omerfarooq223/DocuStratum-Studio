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

class EmbeddingEngine:
    _instance: Optional["EmbeddingEngine"] = None
    _lock = threading.Lock()

    def __init__(self, model_name: str = DEFAULT_MODEL_NAME):
        self.model_name = model_name
        self.dimension = DEFAULT_DIMENSION
        self.device = "cpu"
        self._model = None
        self._status: str = "unloaded"
        self._cache: Dict[str, np.ndarray] = {}  # key: f"{model_name}:{content_hash}" -> (384,) ndarray
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
        strategy: Optional[str] = None
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
                totalCandidates=0
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
                totalCandidates=0
            )

        # 1. Embed query (normalize_embeddings=True gives unit L2 norm)
        query_vec_mat, _, _ = self.embed_texts([query.strip()])
        query_vec = query_vec_mat[0]  # shape: (384,)

        # 2. Embed / retrieve candidate chunk vectors
        chunk_matrix, _, _ = self.embed_chunks(candidate_chunks)  # shape: (N, 384)

        # 3. In-memory cosine similarity: dot product of normalized vectors
        # Shape: (N,)
        similarities = np.dot(chunk_matrix, query_vec)

        # 4. Deterministic tie-breaking:
        # We sort by:
        #  - similarity score descending (-score)
        #  - chunk.sequence ascending
        #  - chunk.id ascending
        scored_candidates = []
        for idx, (chunk, score_val) in enumerate(zip(candidate_chunks, similarities)):
            score_float = float(np.clip(score_val, -1.0, 1.0))
            # Round score for display / tie-breaking stability
            rounded_score = round(score_float, 4)
            scored_candidates.append({
                "chunk": chunk,
                "score": rounded_score,
                "sequence": chunk.sequence,
                "id": chunk.id
            })

        # Sort with deterministic tie breaking
        scored_candidates.sort(key=lambda item: (-item["score"], item["sequence"], item["id"]))

        # 5. Extract top_k results
        top_results = scored_candidates[:top_k]


        results: List[RetrievalResultModel] = []
        for rank_idx, item in enumerate(top_results, start=1):
            chunk = item["chunk"]
            # Excerpt: up to 280 characters with clean boundary
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
                    sourceBlockIds=chunk.sourceBlockIds or []
                )
            )

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

        return SearchResponse(
            query=query,
            results=results,
            latencyMs=latency_ms,
            model=self.model_name,
            dimension=self.dimension,
            totalCandidates=len(candidate_chunks)
        )
