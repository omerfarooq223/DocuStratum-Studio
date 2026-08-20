import json
import logging
from unittest.mock import patch

from fastapi.testclient import TestClient

from service.limits import MAX_REQUEST_BYTES
from service.main import app


client = TestClient(app, raise_server_exceptions=False)


def _chunk(index: int = 0, content: str = "safe evidence") -> dict:
    return {
        "id": f"chk_{index}",
        "sourceNamespace": "day9",
        "strategy": "heading_aware",
        "sequence": index,
        "content": content,
        "sourceBlockIds": ["blk_1"],
        "sourceSpans": [{
            "blockId": "blk_1",
            "startOffset": 0,
            "endOffset": len(content),
            "overlapCharacters": 0,
        }],
        "headingPath": ["Security"],
        "tokenCount": 2,
        "characterCount": len(content),
        "contentHash": f"hash_{index}",
    }


def test_request_size_limit_is_friendly_and_preserves_request_id():
    response = client.post(
        "/search",
        content=b"x",
        headers={
            "content-length": str(MAX_REQUEST_BYTES + 1),
            "content-type": "application/json",
            "x-request-id": "day9-size-test",
        },
    )
    assert response.status_code == 413
    assert response.headers["x-request-id"] == "day9-size-test"
    assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"
    assert "Reduce the captured page" in response.json()["error"]["message"]


def test_malformed_payload_returns_structured_validation_error():
    response = client.post("/search", json={"query": "hello", "chunks": "not-a-list"})
    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == "VALIDATION_ERROR"
    assert payload["error"]["requestId"] == response.headers["x-request-id"]


def test_block_and_llm_context_limits_are_enforced():
    oversized = "x" * 50_001
    response = client.post(
        "/search",
        json={"query": "hello", "chunks": [_chunk(content=oversized)]},
    )
    assert response.status_code == 400
    assert "50 characters" not in response.text

    response = client.post(
        "/llm/answer",
        json={"query": "hello", "chunks": [_chunk(i) for i in range(51)]},
    )
    assert response.status_code == 400
    assert "at most 50 items" in response.text


def test_cors_rejects_arbitrary_web_origins_and_accepts_extension_shape():
    denied = client.options(
        "/health",
        headers={"origin": "https://evil.example", "access-control-request-method": "GET"},
    )
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers

    extension_origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
    allowed = client.options(
        "/health",
        headers={"origin": extension_origin, "access-control-request-method": "GET"},
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == extension_origin

    loopback = client.options(
        "/health",
        headers={"origin": "http://127.0.0.1:5175", "access-control-request-method": "GET"},
    )
    assert loopback.status_code == 200
    assert loopback.headers["access-control-allow-origin"] == "http://127.0.0.1:5175"


def test_unhandled_error_does_not_expose_exception_or_page_content():
    secret = "PAGE_CONTENT_SECRET_123"
    with patch("service.main.EmbeddingEngine.get_instance", side_effect=RuntimeError(secret)):
        response = client.get("/model/status")
    assert response.status_code == 500
    assert secret not in response.text
    assert response.json()["error"]["code"] == "INTERNAL_SERVER_ERROR"


def test_request_log_contains_metadata_but_not_payload(caplog):
    secret = "DO_NOT_LOG_PAGE_CONTENT"
    caplog.set_level(logging.INFO, logger="webrag.service")
    response = client.post("/search", json={"query": secret, "chunks": []})
    assert response.status_code == 400
    records = [json.loads(record.message) for record in caplog.records if record.message.startswith("{")]
    completion = next(record for record in records if record.get("event") == "http_request_complete")
    assert completion["path"] == "/search"
    assert completion["method"] == "POST"
    assert "duration_ms" in completion
    assert secret not in caplog.text


def test_security_headers_and_untrusted_request_id_replacement():
    invalid_request_id = "x" * 129
    response = client.get("/health", headers={"x-request-id": invalid_request_id})
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-request-id"] != invalid_request_id
