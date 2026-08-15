import pytest
import numpy as np
from fastapi.testclient import TestClient
from service.main import app
from service.models import ChunkModel, ChunkSourceSpan

client = TestClient(app)

def create_sample_chunk(
    chunk_id: str,
    content: str,
    sequence: int,
    strategy: str = "heading_aware",
    heading_path = None,
    source_block_ids = None
) -> dict:
    if heading_path is None:
        heading_path = ["Documentation", "Overview"]
    if source_block_ids is None:
        source_block_ids = ["block-1"]

    return {
        "id": chunk_id,
        "sourceNamespace": "test-doc",
        "strategy": strategy,
        "sequence": sequence,
        "content": content,
        "sourceBlockIds": source_block_ids,
        "sourceSpans": [
            {
                "blockId": source_block_ids[0],
                "startOffset": 0,
                "endOffset": len(content),
                "overlapCharacters": 0
            }
        ],
        "headingPath": heading_path,
        "tokenCount": len(content.split()),
        "characterCount": len(content),
        "contentHash": f"hash-{chunk_id}-{len(content)}"
    }

def test_model_status_endpoint():
    response = client.get("/model/status")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["modelName"] == "all-MiniLM-L6-v2"
    assert data["dimension"] == 384
    assert data["isLocal"] is True

def test_embed_texts_and_normalization():
    texts = [
        "WebRAG Studio provides local vector retrieval without external network calls.",
        "Deterministic chunking preserves structural heading hierarchy."
    ]
    response = client.post("/embed", json={"texts": texts})
    assert response.status_code == 200
    data = response.json()
    assert data["model"] == "all-MiniLM-L6-v2"
    assert data["dimension"] == 384
    assert len(data["embeddings"]) == 2
    assert len(data["embeddings"][0]) == 384
    assert len(data["embeddings"][1]) == 384

    # Verify L2 normalization: norm should be ~ 1.0
    vec1 = np.array(data["embeddings"][0])
    vec2 = np.array(data["embeddings"][1])
    np.testing.assert_almost_equal(np.linalg.norm(vec1), 1.0, decimal=4)
    np.testing.assert_almost_equal(np.linalg.norm(vec2), 1.0, decimal=4)

def test_embed_cache_hits():
    chunk = create_sample_chunk("chunk-cache-1", "Local caching prevents redundant neural embedding computation.", 0)
    
    # First call: computes embedding
    resp1 = client.post("/embed", json={"chunks": [chunk]})
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["computedCount"] >= 1

    # Second call with identical contentHash: hits cache
    resp2 = client.post("/embed", json={"chunks": [chunk]})
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["cachedCount"] == 1
    assert data2["computedCount"] == 0
    assert data1["embeddings"] == data2["embeddings"]

def test_search_retrieves_top_5_results_with_provenance():
    chunks = [
        create_sample_chunk(
            "chunk-arch",
            "The architecture consists of a Chrome MV3 extension side panel and a local FastAPI companion service.",
            0,
            heading_path=["WebRAG", "Architecture"]
        ),
        create_sample_chunk(
            "chunk-security",
            "Security contract: never extract passwords, secret tokens, script tags, or hidden input controls.",
            1,
            heading_path=["WebRAG", "Security Guidelines"]
        ),
        create_sample_chunk(
            "chunk-chunking",
            "Deterministic chunkers provide recursive sliding windows and heading-aware structural sections.",
            2,
            heading_path=["WebRAG", "Chunking Engine"]
        ),
        create_sample_chunk(
            "chunk-export",
            "Export generates reproducible ZIP packages containing cleaned Markdown, JSONL blocks, and manifest.",
            3,
            heading_path=["WebRAG", "Export Package"]
        ),
        create_sample_chunk(
            "chunk-retrieval",
            "In-memory cosine similarity search evaluates top-k candidate chunks against the user query vector.",
            4,
            heading_path=["WebRAG", "Vector Search"]
        ),
        create_sample_chunk(
            "chunk-evaluation",
            "Evaluation metrics compute hit@k and reciprocal rank against curated ground truth questions.",
            5,
            heading_path=["WebRAG", "Evaluation"]
        )
    ]

    # Query 1: Security guidelines
    resp = client.post("/search", json={
        "query": "What are the security rules for passwords and tokens?",
        "chunks": chunks,
        "topK": 5
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["query"] == "What are the security rules for passwords and tokens?"
    assert len(data["results"]) == 5
    assert data["results"][0]["chunkId"] == "chunk-security"
    assert data["results"][0]["rank"] == 1
    assert data["results"][0]["score"] > 0.4
    assert data["results"][0]["headingPath"] == ["WebRAG", "Security Guidelines"]
    assert "chunk-arch" in [r["chunkId"] for r in data["results"]]

    # Query 2: Architecture
    resp_arch = client.post("/search", json={
        "query": "FastAPI companion service and Chrome extension side panel",
        "chunks": chunks,
        "topK": 5
    })
    assert resp_arch.status_code == 200
    data_arch = resp_arch.json()
    assert data_arch["results"][0]["chunkId"] == "chunk-arch"
    assert data_arch["results"][0]["rank"] == 1

def test_search_deterministic_tie_breaking():
    chunks = [
        create_sample_chunk("chunk-a", "Identical content block for tie testing", 0),
        create_sample_chunk("chunk-b", "Identical content block for tie testing", 1),
        create_sample_chunk("chunk-c", "Identical content block for tie testing", 2),
    ]

    # Run query multiple times
    runs = []
    for _ in range(5):
        resp = client.post("/search", json={
            "query": "Identical content block",
            "chunks": chunks,
            "topK": 3
        })
        assert resp.status_code == 200
        runs.append([r["chunkId"] for r in resp.json()["results"]])

    # All runs must have identical ranking order (chunk-a, chunk-b, chunk-c)
    for r in runs:
        assert r == ["chunk-a", "chunk-b", "chunk-c"]

def test_search_strategy_filter():
    chunks = [
        create_sample_chunk("chunk-rec-1", "Fast vector embeddings search", 0, strategy="recursive"),
        create_sample_chunk("chunk-head-1", "Fast vector embeddings search", 1, strategy="heading_aware")
    ]

    resp = client.post("/search", json={
        "query": "vector embeddings",
        "chunks": chunks,
        "strategy": "heading_aware"
    })
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 1
    assert results[0]["chunkId"] == "chunk-head-1"
    assert results[0]["strategy"] == "heading_aware"

def test_search_validation_errors():
    # Empty query
    resp1 = client.post("/search", json={"query": "", "chunks": []})
    assert resp1.status_code in [400, 422]
    assert "error" in resp1.json()

    # Empty chunks
    resp2 = client.post("/search", json={"query": "hello", "chunks": []})
    assert resp2.status_code in [400, 422]
    assert "error" in resp2.json()
