from service.models import ChunkModel


def test_day_4_chunk_contract_records_overlap_spans_and_continuations():
    chunk = ChunkModel.model_validate(
        {
            "id": "chk_0123456789abcdef01234567",
            "sourceNamespace": "cap_0123456789abcdef01234567",
            "strategy": "recursive",
            "sequence": 1,
            "content": "overlapping chunk content",
            "sourceBlockIds": ["blk_source"],
            "sourceSpans": [
                {
                    "blockId": "blk_source",
                    "startOffset": 12,
                    "endOffset": 37,
                    "overlapCharacters": 6,
                }
            ],
            "headingPath": ["Guide", "Reference"],
            "tokenCount": 3,
            "characterCount": 25,
            "contentHash": "a" * 64,
            "overlap": {
                "fromChunkId": "chk_previous",
                "fromSequence": 0,
                "characterCount": 6,
                "contentHash": "b" * 64,
            },
            "continuations": [
                {
                    "sourceBlockId": "blk_source",
                    "blockType": "code",
                    "part": 2,
                    "totalParts": 3,
                    "reason": "oversized",
                }
            ],
        }
    )

    assert chunk.overlap.characterCount == 6
    assert chunk.sourceSpans[0].startOffset == 12
    assert chunk.continuations[0].totalParts == 3
