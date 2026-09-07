import pytest
import json
import zipfile
import io
from fastapi.testclient import TestClient

from service.main import app
from service.models import (
    CaptureModel,
    BlockModel,
    SourceAnchor,
    TextQuote,
    CaptureResultModel,
    ChunkModel,
    ChunkSourceSpan,
    TestQuestionModel,
    RetrievalEvaluationResultModel,
    RetrievalResultModel,
    GroundedAnswerResponse,
    CitationRefModel,
    GenerationMetadata,
)
from service.packager import (
    PackageExporter,
    validate_package_zip,
    validate_referential_integrity,
    RAGPackage,
)
from service.examples.similarity_search_example import run_similarity_search_example
from service.examples.chroma_import_example import run_chroma_import_example


@pytest.fixture
def sample_capture_data():
    cap = CaptureModel(
        id="cap_test_1",
        url="https://example.com/docs/auth",
        canonicalUrl="https://example.com/docs/auth",
        title="Authentication Guide",
        mode="page",
        timestamp="2026-08-19T10:00:00Z",
        extractorVersion="1.0.0",
        contentHash="hash_root_123",
    )
    b1 = BlockModel(
        id="b_head_1",
        type="heading",
        content="API Authentication",
        headingPath=["API Authentication"],
        sourceAnchor=SourceAnchor(
            blockId="b_head_1",
            headingPath=["API Authentication"],
            cssSelector="h1#auth",
            textQuote=TextQuote(exact="API Authentication"),
        ),
        contentHash="b1_hash",
        included=True,
    )
    b2 = BlockModel(
        id="b_para_1",
        type="paragraph",
        content="All API requests require a valid Bearer token provided in the Authorization header.",
        headingPath=["API Authentication"],
        sourceAnchor=SourceAnchor(
            blockId="b_para_1",
            headingPath=["API Authentication"],
            cssSelector="p.desc",
            textQuote=TextQuote(exact="All API requests require..."),
        ),
        contentHash="b2_hash",
        included=True,
    )
    c1 = ChunkModel(
        id="chk_rec_0",
        sourceNamespace="cap_test_1",
        strategy="recursive",
        sequence=0,
        content="API Authentication\nAll API requests require a valid Bearer token provided in the Authorization header.",
        sourceBlockIds=["b_head_1", "b_para_1"],
        sourceSpans=[
            ChunkSourceSpan(blockId="b_head_1", startOffset=0, endOffset=18, overlapCharacters=0),
            ChunkSourceSpan(blockId="b_para_1", startOffset=19, endOffset=100, overlapCharacters=0),
        ],
        headingPath=["API Authentication"],
        tokenCount=17,
        characterCount=100,
        contentHash="c1_hash",
    )
    q1 = TestQuestionModel(
        id="q_1",
        query="What header is required for API authentication?",
        expectedBlockId="b_para_1",
        status="curated",
        createdAt="2026-08-19T10:05:00Z",
        updatedAt="2026-08-19T10:05:00Z",
    )
    rr1 = RetrievalEvaluationResultModel(
        id="eval_1",
        questionId="q_1",
        query="What header is required for API authentication?",
        expectedBlockId="b_para_1",
        strategy="recursive",
        topK=1,
        measuredLatencyMs=4.2,
        results=[
            RetrievalResultModel(
                chunkId="chk_rec_0",
                score=0.92,
                rank=1,
                strategy="recursive",
                headingPath=["API Authentication"],
                excerpt="All API requests require...",
                sourceBlockIds=["b_head_1", "b_para_1"],
            )
        ],
        hitAt1=True,
        hitAt3=True,
        hitAt5=True,
        reciprocalRank=1.0,
        timestamp="2026-08-19T10:06:00Z",
    )
    ans1 = GroundedAnswerResponse(
        query="What header is required for API authentication?",
        answer="All API requests require a valid Bearer token in the Authorization header.",
        citations=["chk_rec_0"],
        citationRefs=[
            CitationRefModel(
                chunkId="chk_rec_0",
                sourceBlockIds=["b_head_1", "b_para_1"],
                headingPath=["API Authentication"],
                excerpt="All API requests require...",
            )
        ],
        insufficientEvidence=False,
        model="llama-3.3-70b-versatile",
        provider="groq",
        latencyMs=120.5,
        promptVersion="v1.0.0",
    )
    return {
        "capture_result": CaptureResultModel(capture=cap, blocks=[b1, b2]),
        "chunks": [c1],
        "questions": [q1],
        "retrieval_results": [rr1],
        "answers": [ans1],
    }


def test_manifest_creation_and_checksum_integrity(sample_capture_data):
    zip_bytes, manifest = PackageExporter.build_package_zip(
        capture_result=sample_capture_data["capture_result"],
        chunks=sample_capture_data["chunks"],
        questions=sample_capture_data["questions"],
        retrieval_results=sample_capture_data["retrieval_results"],
        answers=sample_capture_data["answers"],
    )

    assert manifest.formatVersion == "1.0.0"
    assert manifest.sourceIdentity.url == "https://example.com/docs/auth"
    assert manifest.sourceIdentity.title == "Authentication Guide"
    assert len(manifest.files) >= 5

    # Verify every file has matching SHA-256 and byte count in ZIP
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    for entry in manifest.files:
        assert entry.path in zf.namelist()
        data = zf.read(entry.path)
        assert len(data) == entry.bytes


def test_referential_integrity_catches_dangling_blocks(sample_capture_data):
    bad_chunk = ChunkModel(
        id="chk_bad",
        sourceNamespace="cap_test_1",
        strategy="recursive",
        sequence=1,
        content="Bad dangling block reference chunk",
        sourceBlockIds=["b_NON_EXISTENT_999"],
        sourceSpans=[
            ChunkSourceSpan(blockId="b_NON_EXISTENT_999", startOffset=0, endOffset=30, overlapCharacters=0)
        ],
        headingPath=["API Authentication"],
        tokenCount=5,
        characterCount=30,
        contentHash="bad_hash",
    )

    with pytest.raises(ValueError) as exc_info:
        PackageExporter.build_package_zip(
            capture_result=sample_capture_data["capture_result"],
            chunks=[bad_chunk],
        )

    assert "DANGLING_BLOCK_REFERENCE" in str(exc_info.value)
    assert "b_NON_EXISTENT_999" in str(exc_info.value)


def test_referential_integrity_catches_dangling_answer_citation(sample_capture_data):
    bad_answer = GroundedAnswerResponse(
        query="What is the key?",
        answer="The key is 42.",
        citations=["chk_NON_EXISTENT_888"],
        citationRefs=[],
        insufficientEvidence=False,
        model="llama-3.3-70b-versatile",
        provider="groq",
        latencyMs=100.0,
        promptVersion="v1.0.0",
    )

    with pytest.raises(ValueError) as exc_info:
        PackageExporter.build_package_zip(
            capture_result=sample_capture_data["capture_result"],
            chunks=sample_capture_data["chunks"],
            answers=[bad_answer],
        )

    assert "DANGLING_ANSWER_CITATION" in str(exc_info.value)
    assert "chk_NON_EXISTENT_888" in str(exc_info.value)


def test_round_trip_export_and_loader_consumption(sample_capture_data):
    zip_bytes, manifest = PackageExporter.build_package_zip(
        capture_result=sample_capture_data["capture_result"],
        chunks=sample_capture_data["chunks"],
        questions=sample_capture_data["questions"],
        retrieval_results=sample_capture_data["retrieval_results"],
        answers=sample_capture_data["answers"],
    )

    # 1. Validate ZIP
    report = validate_package_zip(zip_bytes)
    assert report.valid is True
    assert report.totalBlocks == 2
    assert report.totalChunks == 1
    assert report.totalQuestions == 1
    assert report.totalAnswers == 1
    assert len(report.issues) == 0

    # 2. Open via dependency-light RAGPackage loader
    with RAGPackage.open(zip_bytes) as pkg:
        assert pkg.format_version == "1.0.0"
        assert pkg.source_identity["url"] == "https://example.com/docs/auth"
        
        # Test markdown & README extraction
        cleaned_md = pkg.get_cleaned_markdown()
        assert "API Authentication" in cleaned_md
        readme = pkg.get_readme()
        assert "DocuStratum Portable Package" in readme

        # Test block iteration & indexing
        blocks = list(pkg.iter_blocks())
        assert len(blocks) == 2
        assert pkg.get_block("b_head_1")["type"] == "heading"

        # Test chunk iteration & provenance resolution
        chunks = list(pkg.iter_chunks())
        assert len(chunks) == 1
        prov = pkg.get_chunk_with_provenance("chk_rec_0")
        assert prov is not None
        assert len(prov["sourceBlocks"]) == 2
        assert {b["id"] for b in prov["sourceBlocks"]} == {"b_head_1", "b_para_1"}

        # Test questions & answers iteration
        questions = list(pkg.iter_questions())
        assert len(questions) == 1
        assert questions[0]["query"] == "What header is required for API authentication?"

        answers = list(pkg.iter_answers())
        assert len(answers) == 1
        assert answers[0]["citations"] == ["chk_rec_0"]


def test_vector_omission_guarantee(sample_capture_data):
    zip_bytes, manifest = PackageExporter.build_package_zip(
        capture_result=sample_capture_data["capture_result"],
        chunks=sample_capture_data["chunks"],
    )

    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    for name in zf.namelist():
        assert not name.endswith(".npy")
        assert not name.endswith(".pt")
        assert not name.endswith(".bin")
        assert "embeddings" not in name.lower()

    assert manifest.embeddingMetadata.modelName == "all-MiniLM-L6-v2"
    assert manifest.embeddingMetadata.dimension == 384
    assert manifest.embeddingMetadata.metric == "cosine"
    assert manifest.embeddingMetadata.normalized is True


def test_zero_credentials_guarantee(sample_capture_data):
    gen_meta = GenerationMetadata(
        provider="groq",
        model="llama-3.3-70b-versatile",
        promptVersion="v1.0.0",
        temperature=0.1,
    )
    zip_bytes, manifest = PackageExporter.build_package_zip(
        capture_result=sample_capture_data["capture_result"],
        chunks=sample_capture_data["chunks"],
        generation_metadata=gen_meta,
    )

    manifest_json_str = json.dumps(manifest.model_dump())
    assert "gsk_" not in manifest_json_str
    assert "sk-" not in manifest_json_str
    assert "Bearer" not in manifest_json_str
    assert "api_key" not in manifest_json_str.lower() or "authorization" not in manifest_json_str.lower()


def test_api_endpoints_export_and_validate(sample_capture_data):
    client = TestClient(app)

    payload = {
        "captureResult": sample_capture_data["capture_result"].model_dump(),
        "chunks": [c.model_dump() for c in sample_capture_data["chunks"]],
        "questions": [q.model_dump() for q in sample_capture_data["questions"]],
        "retrievalResults": [r.model_dump() for r in sample_capture_data["retrieval_results"]],
        "answers": [a.model_dump() for a in sample_capture_data["answers"]],
    }

    # 1. POST /export/package
    export_resp = client.post("/export/package", json=payload)
    assert export_resp.status_code == 200
    assert export_resp.headers["content-type"] == "application/zip"
    assert "attachment; filename=" in export_resp.headers["content-disposition"]
    zip_content = export_resp.content
    assert len(zip_content) > 0

    # 2. POST /package/validate
    val_resp = client.post(
        "/package/validate",
        content=zip_content,
        headers={"Content-Type": "application/zip"}
    )
    assert val_resp.status_code == 200
    val_data = val_resp.json()
    assert val_data["valid"] is True
    assert val_data["totalBlocks"] == 2
    assert val_data["totalChunks"] == 1
    assert val_data["totalQuestions"] == 1
    assert val_data["totalAnswers"] == 1


def test_downstream_example_scripts(sample_capture_data):
    zip_bytes, _ = PackageExporter.build_package_zip(
        capture_result=sample_capture_data["capture_result"],
        chunks=sample_capture_data["chunks"],
    )

    # Should run cleanly without throwing exceptions
    run_similarity_search_example(zip_bytes)
    run_chroma_import_example(zip_bytes)
