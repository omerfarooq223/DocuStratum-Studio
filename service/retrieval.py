import logging
import time
import math
import re
from typing import List, Tuple, Optional
from service.models import ChunkModel, RetrievalResultItem, ChunkingStrategy

logger = logging.getLogger("webrag.retrieval")

def tokenize(text: str) -> List[str]:
    return re.findall(r'\w+', text.lower())

def compute_bm25_similarity(query: str, documents: List[str], k1: float = 1.5, b: float = 0.75) -> List[float]:
    query_tokens = tokenize(query)
    if not query_tokens or not documents:
        return [0.0] * len(documents)

    doc_tokens = [tokenize(doc) for doc in documents]
    num_docs = len(documents)
    total_doc_len = sum(len(tokens) for tokens in doc_tokens)
    avgdl = total_doc_len / num_docs if num_docs > 0 else 1.0

    # Document frequency
    df = {}
    for tokens in doc_tokens:
        seen = set(tokens)
        for t in seen:
            df[t] = df.get(t, 0) + 1

    # BM25 IDF: ln((N - n + 0.5) / (n + 0.5) + 1)
    idf = {}
    for qt in query_tokens:
        n_q = df.get(qt, 0)
        idf[qt] = math.log(((num_docs - n_q + 0.5) / (n_q + 0.5)) + 1.0)

    scores = []
    for tokens in doc_tokens:
        if not tokens:
            scores.append(0.0)
            continue
        
        doc_len = len(tokens)
        score = 0.0
        for qt in query_tokens:
            tf = tokens.count(qt)
            if tf > 0:
                denom = tf + k1 * (1.0 - b + b * (doc_len / max(1.0, avgdl)))
                score += idf[qt] * (tf * (k1 + 1.0) / denom)
        scores.append(score)

    max_score = max(scores) if scores else 0.0
    if max_score > 0:
        return [round(s / max_score, 4) for s in scores]
    return [0.0] * len(documents)

def compute_tf_idf_similarity(query: str, documents: List[str]) -> List[float]:
    """Preserved for backward compatibility, delegates to BM25."""
    return compute_bm25_similarity(query, documents)

def run_retrieval(
    query: str,
    chunks: List[ChunkModel],
    strategy: ChunkingStrategy,
    top_k: int = 5,
    search_mode: str = "hybrid",
    min_score: Optional[float] = None
) -> Tuple[List[RetrievalResultItem], float, bool, Optional[str]]:
    start_time = time.perf_counter()

    if not chunks or not query.strip():
        return [], 0.0, False, None

    degraded = False
    fallback_reason = None

    # Try embedding engine if search_mode is hybrid or dense
    if search_mode in ("hybrid", "dense"):
        try:
            from service.embeddings import EmbeddingEngine
            engine = EmbeddingEngine.get_instance()
            search_res = engine.search(
                query=query,
                chunks=chunks,
                top_k=top_k,
                strategy=strategy,
                search_mode=search_mode,
                min_score=min_score
            )
            items = [
                RetrievalResultItem(
                    chunkId=r.chunkId,
                    score=r.score,
                    rank=r.rank,
                    strategy=r.strategy,
                    headingPath=r.headingPath,
                    excerpt=r.excerpt,
                    sourceBlockIds=r.sourceBlockIds,
                    searchMode=r.searchMode or search_mode,
                    denseScore=r.denseScore,
                    bm25Score=r.bm25Score
                )
                for r in search_res.results
            ]
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return items, duration_ms, False, None
        except Exception as exc:
            if search_mode == "dense":
                logger.error(f"Dense vector retrieval failed: {exc}", exc_info=True)
                raise RuntimeError(f"Dense vector retrieval failed: {exc}") from exc
            
            # Hybrid mode: fall back to BM25, log warning and report degraded
            logger.warning(
                f"Dense retrieval component failed during hybrid search; falling back to lexical BM25: {exc}",
                exc_info=True
            )
            degraded = True
            fallback_reason = str(exc)

    # Pure BM25 retrieval
    filtered_chunks = [c for c in chunks if c.strategy == strategy]
    if not filtered_chunks:
        filtered_chunks = chunks

    doc_contents = [c.content for c in filtered_chunks]
    similarities = compute_bm25_similarity(query, doc_contents)

    indexed_scores = list(enumerate(similarities))
    if min_score is not None:
        indexed_scores = [(idx, s) for idx, s in indexed_scores if s >= min_score]

    # Deterministic sort descending by similarity score, then sequence, then id
    indexed_scores.sort(
        key=lambda x: (
            -x[1],
            filtered_chunks[x[0]].sequence,
            filtered_chunks[x[0]].id
        )
    )

    results: List[RetrievalResultItem] = []
    for rank, (idx, score) in enumerate(indexed_scores[:top_k], start=1):
        chunk = filtered_chunks[idx]
        raw_content = chunk.content.strip()
        excerpt = raw_content[:200] + ("..." if len(raw_content) > 200 else "")
        results.append(
            RetrievalResultItem(
                chunkId=chunk.id,
                score=score,
                rank=rank,
                strategy=strategy,
                headingPath=chunk.headingPath or [],
                excerpt=excerpt,
                sourceBlockIds=chunk.sourceBlockIds or [],
                searchMode="bm25",
                bm25Score=score
            )
        )

    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
    return results, duration_ms, degraded, fallback_reason
