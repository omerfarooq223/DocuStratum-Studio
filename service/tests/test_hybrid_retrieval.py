import pytest
from fastapi.testclient import TestClient
from service.main import app
from service.retrieval import compute_bm25_similarity

client = TestClient(app)

def create_chunk(chunk_id: str, content: str, sequence: int):
    return {
        "id": chunk_id,
        "sourceNamespace": "test-hybrid",
        "strategy": "heading_aware",
        "sequence": sequence,
        "content": content,
        "sourceBlockIds": ["b1"],
        "sourceSpans": [{
            "blockId": "b1",
            "startOffset": 0,
            "endOffset": len(content),
            "overlapCharacters": 0
        }],
        "headingPath": ["Test", "Hybrid"],
        "tokenCount": len(content.split()),
        "characterCount": len(content),
        "contentHash": f"hash-{chunk_id}"
    }

def test_bm25_scoring_exact_keywords():
    docs = [
        "The quick brown fox jumps over the lazy dog.",
        "def compute_special_hash_key(token: str) -> str: return token[::-1]",
        "Machine learning models use dense vector embeddings for semantic search."
    ]
    query = "compute_special_hash_key"
    scores = compute_bm25_similarity(query, docs)
    assert len(scores) == 3
    # Second document contains exact function name
    assert scores[1] == 1.0
    assert scores[0] == 0.0
    assert scores[2] == 0.0

@pytest.mark.real_model
def test_hybrid_search_endpoint_modes():
    chunks = [
        create_chunk("chk-code", "Implementation of handle_special_auth_token in Python.", 0),
        create_chunk("chk-concept", "User authentication and authorization policies in modern security.", 1),
        create_chunk("chk-other", "General overview of database migration scripts.", 2),
    ]

    # 1. Search with BM25 mode
    resp_bm25 = client.post("/search", json={
        "query": "handle_special_auth_token",
        "chunks": chunks,
        "topK": 2,
        "searchMode": "bm25"
    })
    assert resp_bm25.status_code == 200
    data_bm25 = resp_bm25.json()
    assert data_bm25["results"][0]["chunkId"] == "chk-code"
    assert data_bm25["results"][0]["searchMode"] == "bm25"
    assert data_bm25["results"][0]["bm25Score"] is not None

    # 2. Search with Hybrid mode
    resp_hybrid = client.post("/search", json={
        "query": "handle_special_auth_token",
        "chunks": chunks,
        "topK": 2,
        "searchMode": "hybrid"
    })
    assert resp_hybrid.status_code == 200
    data_hybrid = resp_hybrid.json()
    assert data_hybrid["results"][0]["chunkId"] == "chk-code"
    assert data_hybrid["results"][0]["searchMode"] == "hybrid"
    assert data_hybrid["results"][0]["denseScore"] is not None
    assert data_hybrid["results"][0]["bm25Score"] is not None

@pytest.mark.real_model
def test_retrieval_query_hybrid_endpoint():
    chunks = [
        create_chunk("chk-1", "Fast local neural retrieval with MiniLM.", 0),
        create_chunk("chk-2", "Heading-aware chunking preserving hierarchy.", 1),
    ]

    resp = client.post("/retrieval/query", json={
        "query": "neural retrieval",
        "chunks": chunks,
        "strategy": "heading_aware",
        "topK": 2,
        "searchMode": "hybrid"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["results"]) == 2
    assert data["results"][0]["chunkId"] == "chk-1"
    assert data["searchMode"] == "hybrid"


def test_rrf_zero_signal_produces_zero_score_not_one(monkeypatch):
    """
    Issue 1: When dense and BM25 scores are all zero, results must receive 0.0, NOT 1.0.
    """
    import numpy as np
    from service.embeddings import EmbeddingEngine
    from service.models import ChunkModel

    engine = EmbeddingEngine.get_instance()
    chunks = [
        ChunkModel(**create_chunk("chk-zero-1", "Completely unrelated content one", 0)),
        ChunkModel(**create_chunk("chk-zero-2", "Completely unrelated content two", 1)),
    ]

    # Mock embeddings to return orthogonal vectors (cosine similarity = 0.0)
    def mock_embed_texts(texts, hashes=None):
        return np.zeros((len(texts), 384), dtype=np.float32), 0, len(texts)

    def mock_embed_chunks(chunk_list):
        return np.zeros((len(chunk_list), 384), dtype=np.float32), 0, len(chunk_list)

    monkeypatch.setattr(engine, "embed_texts", mock_embed_texts)
    monkeypatch.setattr(engine, "embed_chunks", mock_embed_chunks)

    # Search with a query having zero lexical match
    res = engine.search(
        query="zzzqxxnonexistentword",
        chunks=chunks,
        top_k=2,
        search_mode="hybrid"
    )

    assert len(res.results) == 2
    # Verify neither chunk received the misleading 1.0 score
    for r in res.results:
        assert r.score == 0.0, f"Expected hybrid score 0.0 for zero signal, got {r.score}"


def test_no_match_threshold_filters_zero_signal_candidates(monkeypatch):
    """
    Issue 1: An optional min_score threshold should filter out zero-signal candidates.
    """
    import numpy as np
    from service.embeddings import EmbeddingEngine
    from service.models import ChunkModel

    engine = EmbeddingEngine.get_instance()
    chunks = [
        ChunkModel(**create_chunk("chk-zero-1", "Completely unrelated content one", 0)),
        ChunkModel(**create_chunk("chk-zero-2", "Completely unrelated content two", 1)),
    ]

    monkeypatch.setattr(engine, "embed_texts", lambda texts, hashes=None: (np.zeros((len(texts), 384), dtype=np.float32), 0, len(texts)))
    monkeypatch.setattr(engine, "embed_chunks", lambda chks: (np.zeros((len(chks), 384), dtype=np.float32), 0, len(chks)))

    # With min_score=0.01, zero-signal results should be filtered out
    res = engine.search(
        query="zzzqxxnonexistentword",
        chunks=chunks,
        top_k=2,
        search_mode="hybrid",
        min_score=0.01
    )
    assert len(res.results) == 0


def test_dense_search_failure_returns_clear_error(monkeypatch):
    """
    Issue 2: If model fails, explicitly requested dense search must return a clear error, NOT silently turn into BM25.
    """
    from service.embeddings import EmbeddingEngine

    def mock_search_raise(*args, **kwargs):
        raise RuntimeError("SentenceTransformer weights corrupted or missing")

    engine = EmbeddingEngine.get_instance()
    monkeypatch.setattr(engine, "search", mock_search_raise)

    chunks = [create_chunk("chk-1", "Fast local neural retrieval with MiniLM.", 0)]

    resp = client.post("/retrieval/query", json={
        "query": "neural retrieval",
        "chunks": chunks,
        "strategy": "heading_aware",
        "searchMode": "dense"
    })

    assert resp.status_code == 503
    assert "Dense vector retrieval failed" in resp.json()["error"]["message"]


def test_hybrid_search_fallback_reports_degraded_mode_and_logs(monkeypatch, caplog):
    """
    Issue 2: If model fails during hybrid search, it should fall back to BM25, report degraded mode, and log reason.
    """
    import logging
    from service.embeddings import EmbeddingEngine

    def mock_search_raise(*args, **kwargs):
        raise RuntimeError("GPU OOM / inference unavailable")

    engine = EmbeddingEngine.get_instance()
    monkeypatch.setattr(engine, "search", mock_search_raise)

    chunks = [
        create_chunk("chk-1", "Fast local neural retrieval with MiniLM.", 0),
        create_chunk("chk-2", "Database migrations in Python.", 1),
    ]

    with caplog.at_level(logging.WARNING):
        resp = client.post("/retrieval/query", json={
            "query": "neural retrieval",
            "chunks": chunks,
            "strategy": "heading_aware",
            "searchMode": "hybrid"
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["degraded"] is True
    assert data["searchMode"] == "bm25"
    assert "GPU OOM / inference unavailable" in data["fallbackReason"]
    assert len(data["results"]) >= 1
    assert data["results"][0]["chunkId"] == "chk-1"

    # Verify fallback was logged
    assert any("falling back to lexical BM25" in r.message for r in caplog.records)

