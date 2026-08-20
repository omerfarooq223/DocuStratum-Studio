"""Reproducible local retrieval benchmark for the Day 9 evidence record."""

from __future__ import annotations

import json
import platform
import statistics
import time

from service.embeddings import EmbeddingEngine
from service.models import ChunkModel


DOCUMENTS = [
    ("Token Generation", "Acquire an access token from the OAuth token endpoint using client credentials."),
    ("Token Lifetime", "Access tokens expire after 3600 seconds by default."),
    ("Supported Scopes", "Available scopes include read blocks, write chunks, and execute RAG."),
    ("Security", "Never expose client secrets or API keys in frontend code."),
    ("Response Format", "The token response includes access_token, expires_in, and token_type fields."),
]
BASE_QUERIES = [
    "How long is a token valid?",
    "Which OAuth scopes are supported?",
    "Where should API keys be stored?",
    "Which fields are in the token response?",
    "How do I acquire an access token?",
]
QUERIES = [
    f"{query} Benchmark sample {index + 1}."
    for index, query in enumerate(BASE_QUERIES * 4)
]


def make_chunks() -> list[ChunkModel]:
    chunks: list[ChunkModel] = []
    for index, (heading, content) in enumerate(DOCUMENTS):
        block_id = f"benchmark_block_{index}"
        chunks.append(
            ChunkModel(
                id=f"benchmark_chunk_{index}",
                sourceNamespace="day9-demo-fixture",
                strategy="heading_aware",
                sequence=index,
                content=content,
                sourceBlockIds=[block_id],
                sourceSpans=[{
                    "blockId": block_id,
                    "startOffset": 0,
                    "endOffset": len(content),
                    "overlapCharacters": 0,
                }],
                headingPath=[heading],
                tokenCount=len(content.split()),
                characterCount=len(content),
                contentHash=f"benchmark_hash_{index}",
            )
        )
    return chunks


def main() -> None:
    init_start = time.perf_counter()
    engine = EmbeddingEngine.get_instance()
    chunks = make_chunks()
    engine.search(QUERIES[0], chunks, top_k=5)
    cold_start_ms = (time.perf_counter() - init_start) * 1_000

    samples: list[float] = []
    for query in QUERIES:
        started = time.perf_counter()
        engine.search(query, chunks, top_k=5)
        samples.append((time.perf_counter() - started) * 1_000)

    ordered = sorted(samples)
    p95_index = max(0, min(len(ordered) - 1, round(0.95 * len(ordered)) - 1))
    print(json.dumps({
        "hardware": platform.machine(),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "model": engine.model_name,
        "device": engine.device,
        "fixtureChunks": len(chunks),
        "sampleCount": len(samples),
        "coldStartMs": round(cold_start_ms, 2),
        "warmMedianMs": round(statistics.median(samples), 2),
        "warmP95Ms": round(ordered[p95_index], 2),
    }, indent=2))


if __name__ == "__main__":
    main()
