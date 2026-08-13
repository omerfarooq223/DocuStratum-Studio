from service.models import CaptureResultModel


def test_day_2_capture_result_contract_accepts_structured_provenance():
    result = CaptureResultModel.model_validate(
        {
            "capture": {
                "id": "cap_0123456789abcdef01234567",
                "url": "https://example.com/docs",
                "canonicalUrl": "https://example.com/docs/canonical",
                "title": "Example documentation",
                "mode": "page",
                "timestamp": "2026-08-13T10:00:00.000Z",
                "extractorVersion": "webrag-dom/0.2.0",
                "contentHash": "a" * 64,
            },
            "blocks": [
                {
                    "id": "blk_0123456789abcdef01234567",
                    "type": "table",
                    "content": "| Name | Value |\n| --- | --- |\n| mode | page |",
                    "headingPath": ["Reference"],
                    "sourceAnchor": {
                        "blockId": "blk_0123456789abcdef01234567",
                        "headingPath": ["Reference"],
                        "cssSelector": "#reference > table",
                        "nodePath": "/html[1]/body[1]/main[1]/table[1]",
                        "textQuote": {
                            "exact": "Name Value mode page",
                            "prefix": "Reference",
                        },
                    },
                    "contentHash": "b" * 64,
                    "included": True,
                    "attributes": {
                        "tableHeaders": ["Name", "Value"],
                        "tableRows": [["mode", "page"]],
                    },
                }
            ],
        }
    )

    assert result.capture.mode == "page"
    assert result.blocks[0].sourceAnchor.textQuote.exact == "Name Value mode page"
    assert result.blocks[0].attributes.tableRows == [["mode", "page"]]
