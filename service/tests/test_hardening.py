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
        "sourceNamespace": "hardening",
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
            "x-request-id": "hardening-size-test",
        },
    )
    assert response.status_code == 413
    assert response.headers["x-request-id"] == "hardening-size-test"
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


def test_streaming_body_size_enforced_without_content_length():
    """
    Issue 4: Requests exceeding MAX_REQUEST_BYTES while streaming (without Content-Length) must return 413.
    """
    oversized_data = b"0" * (MAX_REQUEST_BYTES + 1024)

    def data_stream():
        chunk_size = 64 * 1024
        for i in range(0, len(oversized_data), chunk_size):
            yield oversized_data[i:i + chunk_size]

    response = client.post(
        "/package/validate",
        content=data_stream(),
        headers={
            "content-type": "application/zip",
            "x-request-id": "stream-limit-test",
        },
    )
    assert response.status_code == 413
    assert response.headers["x-request-id"] == "stream-limit-test"
    assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"


def test_zip_bomb_validation_rejects_decompression_bomb():
    """
    Issue 3: validate_package_zip must reject archives exceeding compression ratio or total uncompressed size.
    """
    import io
    import zipfile
    from service.packager.validator import validate_package_zip

    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", b'{"formatVersion": "1.0.0"}')
        zf.writestr("source/cleaned.md", b"0" * (2 * 1024 * 1024))

    report = validate_package_zip(bio.getvalue())
    assert report.valid is False
    codes = [i.code for i in report.issues]
    assert "COMPRESSION_RATIO_EXCEEDED" in codes


def test_zip_validation_rejects_duplicate_entries_and_zip_slip():
    """
    Issue 3: validate_package_zip must reject duplicate entries and Zip Slip directory traversal.
    """
    import io
    import zipfile
    from service.packager.validator import validate_package_zip

    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w") as zf:
        zf.writestr("manifest.json", b'{"formatVersion": "1.0.0"}')
        zf.writestr("manifest.json", b'{"duplicate": true}')
        zf.writestr("../../etc/passwd", b"evil")

    report = validate_package_zip(bio.getvalue())
    assert report.valid is False
    codes = [i.code for i in report.issues]
    assert "DUPLICATE_ZIP_ENTRY" in codes
    assert "PATH_TRAVERSAL_DETECTED" in codes


def test_bearer_token_authentication_enforced(monkeypatch):
    """
    Issue 5: When auth is configured, endpoints require valid Bearer token.
    """
    monkeypatch.setenv("WEBRAG_AUTH_TOKEN", "secret-test-token-12345")

    # Request without token -> 401
    resp_unauth = client.post("/search", json={"query": "test", "chunks": []})
    assert resp_unauth.status_code == 401
    assert "WWW-Authenticate" in resp_unauth.headers

    # Request with invalid token -> 401
    resp_bad = client.post(
        "/search",
        json={"query": "test", "chunks": []},
        headers={"Authorization": "Bearer wrong-token"}
    )
    assert resp_bad.status_code == 401

    # Request with valid Bearer token -> passes auth
    resp_valid = client.post(
        "/search",
        json={"query": "test", "chunks": []},
        headers={"Authorization": "Bearer secret-test-token-12345"}
    )
    assert resp_valid.status_code in (400, 422)
    assert resp_valid.status_code != 401

    # /health is public and does not require auth
    resp_health = client.get("/health")
    assert resp_health.status_code == 200


def test_lru_cache_bounds_and_eviction():
    """
    Issue 7: LRUEmbeddingCache bounds cache size and evicts oldest items.
    """
    import numpy as np
    from service.embeddings import LRUEmbeddingCache

    cache = LRUEmbeddingCache(max_entries=3, max_bytes=10000)
    v1 = np.ones((10,), dtype=np.float32)
    v2 = np.ones((10,), dtype=np.float32) * 2
    v3 = np.ones((10,), dtype=np.float32) * 3
    v4 = np.ones((10,), dtype=np.float32) * 4

    cache.set("k1", v1)
    cache.set("k2", v2)
    cache.set("k3", v3)
    assert len(cache) == 3
    assert "k1" in cache

    # Access k1 to make it most recently used
    _ = cache.get("k1")

    # Insert k4, should evict k2 (oldest LRU)
    cache.set("k4", v4)
    assert len(cache) == 3
    assert "k1" in cache
    assert "k2" not in cache
    assert "k3" in cache
    assert "k4" in cache

