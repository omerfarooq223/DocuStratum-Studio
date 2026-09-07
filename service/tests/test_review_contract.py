import pytest
from service.models import CaptureResultModel, BlockModel, CaptureModel

def test_capture_result_with_block_inclusion_states():
    payload = {
        "capture": {
            "id": "cap-review-001",
            "url": "https://docs.webrag.local/auth",
            "title": "WebRAG Studio Auth Docs",
            "mode": "element",
            "timestamp": "2026-08-14T02:30:00Z",
            "extractorVersion": "1.0.0",
            "contentHash": "sha256-auth-001"
        },
        "blocks": [
            {
                "id": "blk-001",
                "type": "heading",
                "content": "Authentication Setup",
                "headingPath": ["Authentication Setup"],
                "sourceAnchor": {
                    "blockId": "blk-001",
                    "headingPath": ["Authentication Setup"],
                    "cssSelector": "h1#auth-setup",
                    "textQuote": {"exact": "Authentication Setup"}
                },
                "contentHash": "hash-h1",
                "included": True,
                "attributes": {"headingLevel": 1}
            },
            {
                "id": "blk-002",
                "type": "code",
                "content": "export GROQ_API_KEY=secret_key",
                "headingPath": ["Authentication Setup"],
                "sourceAnchor": {
                    "blockId": "blk-002",
                    "headingPath": ["Authentication Setup"],
                    "cssSelector": "pre.bash",
                    "textQuote": {"exact": "export GROQ_API_KEY=secret_key"}
                },
                "contentHash": "hash-code",
                "included": False,
                "attributes": {"codeLanguage": "bash"}
            }
        ]
    }

    result = CaptureResultModel.model_validate(payload)
    assert result.capture.id == "cap-review-001"
    assert len(result.blocks) == 2
    assert result.blocks[0].included is True
    assert result.blocks[1].included is False
    assert result.blocks[1].attributes.codeLanguage == "bash"
