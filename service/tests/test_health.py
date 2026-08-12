import pytest
from fastapi.testclient import TestClient
from service.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["version"] == "0.1.0"
    assert data["schemaVersion"] == "1.0.0"
    assert "requestId" in data
    assert "X-Request-ID" in response.headers

def test_version_endpoint():
    response = client.get("/version")
    assert response.status_code == 200
    data = response.json()
    assert data["apiVersion"] == "0.1.0"
    assert data["schemaVersion"] == "1.0.0"
    assert "selection" in data["supportedModes"]
    assert "recursive" in data["supportedChunkers"]

def test_404_structured_error():
    response = client.get("/non-existent-route")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "HTTP_404"
    assert "X-Request-ID" in response.headers
