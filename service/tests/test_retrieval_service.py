import pytest
from fastapi.testclient import TestClient
from service.main import app
from service.models import ChunkModel, BlockModel, SourceAnchor, TextQuote

client = TestClient(app)

def make_dummy_chunk(chunk_id: str, content: str, source_block_id: str, strategy: str = "recursive") -> dict:
    return {
        "id": chunk_id,
        "sourceNamespace": "test",
        "strategy": strategy,
        "sequence": 0,
        "content": content,
        "sourceBlockIds": [source_block_id],
        "sourceSpans": [{"blockId": source_block_id, "startOffset": 0, "endOffset": len(content), "overlapCharacters": 0}],
        "headingPath": ["Introduction"],
        "tokenCount": len(content.split()),
        "characterCount": len(content),
        "contentHash": "hash_" + chunk_id
    }

def make_dummy_block(block_id: str, content: str, block_type: str = "paragraph") -> dict:
    return {
        "id": block_id,
        "type": block_type,
        "content": content,
        "headingPath": ["Introduction"],
        "sourceAnchor": {
            "blockId": block_id,
            "headingPath": ["Introduction"],
            "cssSelector": "p#" + block_id,
            "textQuote": {"exact": content}
        },
        "contentHash": "hash_" + block_id,
        "included": True
    }

def test_retrieval_query_endpoint():
    chunks = [
        make_dummy_chunk("chk_1", "WebRAG provides safe DOM capture and deterministic chunking.", "blk_1"),
        make_dummy_chunk("chk_2", "Vector retrieval computes cosine similarity over embeddings.", "blk_2"),
        make_dummy_chunk("chk_3", "Heading aware chunking maintains hierarchical boundaries.", "blk_3"),
    ]

    payload = {
        "query": "vector retrieval embeddings",
        "strategy": "recursive",
        "topK": 2,
        "chunks": chunks
    }

    response = client.post("/retrieval/query", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert "executionTimeMs" in data
    assert len(data["results"]) == 2
    # The top ranked chunk should be chk_2 because of 'vector retrieval embeddings'
    assert data["results"][0]["chunkId"] == "chk_2"
    assert data["results"][0]["sourceBlockIds"] == ["blk_2"]
    assert data["results"][0]["rank"] == 1

def test_draft_questions_endpoint():
    blocks = [
        make_dummy_block("blk_1", "WebRAG captures clean semantic content without clutter.", "paragraph"),
        make_dummy_block("blk_2", "Architecture Overview", "heading"),
    ]

    payload = {"blocks": blocks}
    response = client.post("/evaluation/draft-questions", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "questions" in data
    assert len(data["questions"]) == 2
    assert data["questions"][0]["status"] == "draft"
    assert data["questions"][0]["expectedBlockId"] == "blk_1"
    assert data["questions"][1]["status"] == "draft"
    assert data["questions"][1]["expectedBlockId"] == "blk_2"
