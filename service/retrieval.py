import time
import math
import re
from typing import List, Tuple
from service.models import ChunkModel, RetrievalResultItem, ChunkingStrategy

def tokenize(text: str) -> List[str]:
    return re.findall(r'\w+', text.lower())

def compute_tf_idf_similarity(query: str, documents: List[str]) -> List[float]:
    query_tokens = tokenize(query)
    if not query_tokens or not documents:
        return [0.0] * len(documents)

    doc_tokens = [tokenize(doc) for doc in documents]
    num_docs = len(documents)

    # Document frequency
    df = {}
    for tokens in doc_tokens:
        seen = set(tokens)
        for t in seen:
            df[t] = df.get(t, 0) + 1

    # IDF calculation
    idf = {t: math.log((1 + num_docs) / (1 + df.get(t, 0))) + 1.0 for t in query_tokens}

    scores = []
    for tokens in doc_tokens:
        if not tokens:
            scores.append(0.0)
            continue
        
        doc_len = len(tokens)
        score = 0.0
        for qt in query_tokens:
            tf = tokens.count(qt) / doc_len
            score += tf * idf[qt]
        scores.append(score)

    max_score = max(scores) if scores else 0.0
    if max_score > 0:
        return [round(s / max_score, 4) for s in scores]
    return [0.0] * len(documents)

def run_retrieval(
    query: str,
    chunks: List[ChunkModel],
    strategy: ChunkingStrategy,
    top_k: int = 5
) -> Tuple[List[RetrievalResultItem], float]:
    start_time = time.perf_counter()

    if not chunks or not query.strip():
        return [], 0.0

    doc_contents = [c.content for c in chunks]
    similarities = compute_tf_idf_similarity(query, doc_contents)

    indexed_scores = list(enumerate(similarities))
    # Sort descending by similarity score
    indexed_scores.sort(key=lambda x: x[1], reverse=True)

    results: List[RetrievalResultItem] = []
    for rank, (idx, score) in enumerate(indexed_scores[:top_k], start=1):
        chunk = chunks[idx]
        results.append(
            RetrievalResultItem(
                chunkId=chunk.id,
                score=score,
                rank=rank,
                strategy=strategy,
                headingPath=chunk.headingPath,
                excerpt=chunk.content[:200] + ("..." if len(chunk.content) > 200 else ""),
                sourceBlockIds=chunk.sourceBlockIds
            )
        )

    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
    return results, duration_ms
