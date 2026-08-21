#!/usr/bin/env bash
set -e

echo "========================================================"
echo "    WebRAG Studio - Day 10 Release Candidate Verification"
echo "========================================================"
echo ""

# 1. Environment and python verification
if [ -d ".venv" ]; then
  PYTHON=".venv/bin/python3"
  PYTEST=".venv/bin/pytest"
else
  PYTHON="python3"
  PYTEST="pytest"
fi

echo "[Phase 1/5] Running Backend Test Suite..."
PYTHONPATH=. $PYTEST service/tests -v

echo ""
echo "[Phase 2/5] Running Extension Unit & Integration Tests..."
cd extension
npm test
echo ""
echo "[Phase 3/5] Building Extension Distribution..."
npm run build
cd ..

echo ""
echo "[Phase 4/5] Running Day 9 Golden Path Smoke Test..."
bash scripts/smoke-day9.sh

echo ""
echo "[Phase 5/5] Exporting & Validating Sample RAG Package..."
mkdir -p dist/release
PYTHONPATH=. $PYTHON -c '
from pathlib import Path
from service.models import (
    ExportPackageRequest,
    CaptureResultModel,
    CaptureModel,
    BlockModel,
    ChunkModel,
    ChunkSourceSpan,
    TestQuestionModel,
    GroundedAnswerResponse,
    CitationRefModel,
    SourceAnchor,
    TextQuote,
    GenerationMetadata,
)
from service.packager.exporter import PackageExporter
from service.packager.validator import validate_package_zip

# Create a deterministic fixture package
cap = CaptureModel(
    id="cap_demo_rc1",
    url="http://localhost:8080/fixtures/demo-fixture.html",
    title="Auth Demo Fixture",
    mode="element",
    timestamp="2026-08-21T12:00:00Z",
    extractorVersion="1.0.0",
    contentHash="hash_root_rc1",
)
b1 = BlockModel(
    id="blk_001",
    type="heading",
    content="Token Authentication",
    headingPath=["Token Authentication"],
    sourceAnchor=SourceAnchor(
        blockId="blk_001",
        headingPath=["Token Authentication"],
        cssSelector="article > h2",
        textQuote=TextQuote(exact="Token Authentication"),
    ),
    contentHash="b1_hash",
    included=True,
)
b2 = BlockModel(
    id="blk_002",
    type="paragraph",
    content="Tokens expire in 3600 seconds and must be passed as a Bearer token in the Authorization header.",
    headingPath=["Token Authentication"],
    sourceAnchor=SourceAnchor(
        blockId="blk_002",
        headingPath=["Token Authentication"],
        cssSelector="article > p",
        textQuote=TextQuote(exact="Tokens expire in 3600 seconds"),
    ),
    contentHash="b2_hash",
    included=True,
)
capture_result = CaptureResultModel(capture=cap, blocks=[b1, b2])

chunk = ChunkModel(
    id="chk_001",
    sourceNamespace="http://localhost:8080/fixtures/demo-fixture.html",
    strategy="heading_aware",
    sequence=0,
    content="Token Authentication\nTokens expire in 3600 seconds and must be passed as a Bearer token in the Authorization header.",
    sourceBlockIds=["blk_001", "blk_002"],
    sourceSpans=[
        ChunkSourceSpan(blockId="blk_001", startOffset=0, endOffset=20, overlapCharacters=0),
        ChunkSourceSpan(blockId="blk_002", startOffset=21, endOffset=115, overlapCharacters=0),
    ],
    headingPath=["Token Authentication"],
    tokenCount=24,
    characterCount=115,
    contentHash="chk_hash_001",
)

question = TestQuestionModel(
    id="q_001",
    query="How long is an authentication token valid?",
    expectedBlockId="blk_002",
    status="curated",
    createdAt="2026-08-21T12:01:00Z",
    updatedAt="2026-08-21T12:01:00Z",
)

answer = GroundedAnswerResponse(
    query="How long is an authentication token valid?",
    answer="Authentication tokens expire in 3600 seconds [1].",
    citations=["chk_001"],
    citationRefs=[
        CitationRefModel(
            chunkId="chk_001",
            sourceBlockIds=["blk_002"],
            headingPath=["Token Authentication"],
            excerpt="Tokens expire in 3600 seconds",
        )
    ],
    insufficientEvidence=False,
    model="llama-3.3-70b-versatile",
    provider="groq",
    latencyMs=120.5,
    promptVersion="v1.0.0",
)

zip_bytes, manifest = PackageExporter.build_package_zip(
    capture_result=capture_result,
    chunks=[chunk],
    questions=[question],
    answers=[answer],
    generation_metadata=GenerationMetadata(provider="groq", model="llama-3.3-70b-versatile", promptVersion="v1.0.0", temperature=0.1),
)

out_path = Path("dist/release/webrag-sample-rc1.zip")
out_path.parent.mkdir(parents=True, exist_ok=True)
with open(out_path, "wb") as f:
    f.write(zip_bytes)

report = validate_package_zip(zip_bytes)
assert report.valid, f"Sample package validation failed: {[i.message for i in report.issues]}"
print(f"Successfully generated and validated {out_path} ({len(zip_bytes)} bytes)")
print(f"Verified files: {report.totalFiles}, Blocks: {report.totalBlocks}, Chunks: {report.totalChunks}")
'

echo ""
echo "[*] Generating SHA256 Checksums for Release Artifacts..."
cd dist
if command -v shasum >/dev/null 2>&1; then
  find . -type f ! -name "SHA256SUMS.txt" -exec shasum -a 256 {} + > SHA256SUMS.txt
else
  find . -type f ! -name "SHA256SUMS.txt" -exec sha256sum {} + > SHA256SUMS.txt
fi
cd ..

echo "Checksums written to dist/SHA256SUMS.txt"
echo ""
echo "========================================================"
echo "    ✅ ALL DAY 10 RELEASE CANDIDATE CHECKS PASSED!"
echo "========================================================"
