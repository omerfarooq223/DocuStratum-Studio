import io
import json
import os
import zipfile
from typing import List, Dict, Any, Optional, Set, Union
from pathlib import Path

from service.limits import (
    MAX_ZIP_MEMBERS,
    MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES,
    MAX_ZIP_SINGLE_FILE_BYTES,
    MAX_ZIP_COMPRESSION_RATIO,
)
from service.models import (
    BlockModel,
    ChunkModel,
    TestQuestionModel,
    RetrievalEvaluationResultModel,
    GroundedAnswerResponse,
    PackageManifest,
    PackageValidationReport,
    PackageValidationIssue,
)
from service.packager.manifest import compute_sha256_bytes


REQUIRED_PACKAGE_FILES = [
    "manifest.json",
    "source/cleaned.md",
    "source/blocks.jsonl",
    "chunks/chunks.jsonl",
    "README.md",
]


def validate_referential_integrity(
    blocks: List[Union[BlockModel, Dict[str, Any]]],
    chunks: List[Union[ChunkModel, Dict[str, Any]]],
    questions: Optional[List[Union[TestQuestionModel, Dict[str, Any]]]] = None,
    retrieval_results: Optional[List[Union[RetrievalEvaluationResultModel, Dict[str, Any]]]] = None,
    answers: Optional[List[Union[GroundedAnswerResponse, Dict[str, Any]]]] = None,
) -> List[PackageValidationIssue]:
    """
    Validates logical referential integrity across blocks, chunks, evaluation, and answers.
    Rejects exports with dangling block references or invalid citations.
    """
    issues: List[PackageValidationIssue] = []

    # 1. Collect Block IDs
    block_ids: Set[str] = set()
    for idx, b in enumerate(blocks):
        b_id = b.id if isinstance(b, BlockModel) else b.get("id")
        if not b_id:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file="source/blocks.jsonl",
                    code="MISSING_BLOCK_ID",
                    message=f"Block at index {idx} has no valid 'id'.",
                )
            )
        elif b_id in block_ids:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file="source/blocks.jsonl",
                    code="DUPLICATE_BLOCK_ID",
                    message=f"Duplicate block ID '{b_id}' found at index {idx}.",
                )
            )
        else:
            block_ids.add(b_id)

    # 2. Collect & Validate Chunk IDs and Source Block references
    chunk_ids: Set[str] = set()
    for idx, c in enumerate(chunks):
        c_id = c.id if isinstance(c, ChunkModel) else c.get("id")
        if not c_id:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file="chunks/chunks.jsonl",
                    code="MISSING_CHUNK_ID",
                    message=f"Chunk at index {idx} has no valid 'id'.",
                )
            )
            continue
        
        if c_id in chunk_ids:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file="chunks/chunks.jsonl",
                    code="DUPLICATE_CHUNK_ID",
                    message=f"Duplicate chunk ID '{c_id}' found at index {idx}.",
                )
            )
        else:
            chunk_ids.add(c_id)

        source_block_ids = c.sourceBlockIds if isinstance(c, ChunkModel) else c.get("sourceBlockIds", [])
        if not source_block_ids:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file="chunks/chunks.jsonl",
                    code="EMPTY_SOURCE_BLOCKS",
                    message=f"Chunk '{c_id}' has empty sourceBlockIds list.",
                )
            )
        for s_id in source_block_ids:
            if s_id not in block_ids:
                issues.append(
                    PackageValidationIssue(
                        severity="error",
                        file="chunks/chunks.jsonl",
                        code="DANGLING_BLOCK_REFERENCE",
                        message=f"Chunk '{c_id}' references non-existent block ID '{s_id}'.",
                    )
                )

    # 3. Validate Test Questions
    if questions:
        for idx, q in enumerate(questions):
            q_id = q.id if isinstance(q, TestQuestionModel) else q.get("id")
            exp_id = q.expectedBlockId if isinstance(q, TestQuestionModel) else q.get("expectedBlockId")
            if exp_id and exp_id not in block_ids:
                issues.append(
                    PackageValidationIssue(
                        severity="error",
                        file="evaluation/questions.jsonl",
                        code="DANGLING_EXPECTED_BLOCK",
                        message=f"Question '{q_id or idx}' references non-existent expectedBlockId '{exp_id}'.",
                    )
                )

    # 4. Validate Retrieval Results
    if retrieval_results:
        for idx, rr in enumerate(retrieval_results):
            rr_items = rr.results if isinstance(rr, RetrievalEvaluationResultModel) else rr.get("results", [])
            for item in rr_items:
                c_id = item.chunkId if hasattr(item, "chunkId") else item.get("chunkId")
                if c_id and c_id not in chunk_ids:
                    issues.append(
                        PackageValidationIssue(
                            severity="error",
                            file="evaluation/retrieval-results.jsonl",
                            code="DANGLING_RETRIEVAL_CHUNK",
                            message=f"Retrieval run references non-existent chunk ID '{c_id}'.",
                        )
                    )

    # 5. Validate Grounded Answers & Citations
    if answers:
        for idx, ans in enumerate(answers):
            citations = ans.citations if isinstance(ans, GroundedAnswerResponse) else ans.get("citations", [])
            query_preview = (ans.query if isinstance(ans, GroundedAnswerResponse) else ans.get("query", ""))[:40]
            for cit in citations:
                if cit not in chunk_ids:
                    issues.append(
                        PackageValidationIssue(
                            severity="error",
                            file="evaluation/answers.jsonl",
                            code="DANGLING_ANSWER_CITATION",
                            message=(
                                f"Answer for query '{query_preview}...' cites non-existent chunk ID '{cit}'."
                            ),
                        )
                    )

    return issues


def validate_package_zip(
    zip_source: Union[bytes, str, Path, io.BytesIO]
) -> PackageValidationReport:
    """
    Performs full integrity, checksum, and referential validation on a packaged ZIP archive.
    """
    issues: List[PackageValidationIssue] = []
    
    if isinstance(zip_source, bytes):
        zip_file = zipfile.ZipFile(io.BytesIO(zip_source))
    elif isinstance(zip_source, (str, Path)):
        zip_file = zipfile.ZipFile(zip_source)
    else:
        zip_file = zipfile.ZipFile(zip_source)

    infolist = zip_file.infolist()
    namelist = zip_file.namelist()

    # 1. Member count check
    if len(infolist) > MAX_ZIP_MEMBERS:
        issues.append(
            PackageValidationIssue(
                severity="error",
                file="manifest.json",
                code="MAX_ZIP_MEMBERS_EXCEEDED",
                message=f"ZIP archive contains {len(infolist)} entries, exceeding maximum allowed {MAX_ZIP_MEMBERS}.",
            )
        )
        return PackageValidationReport(
            valid=False,
            totalFiles=len(infolist),
            issues=issues,
        )

    # 2. Duplicate entry check
    seen_names = set()
    for info in infolist:
        if info.filename in seen_names:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file=info.filename,
                    code="DUPLICATE_ZIP_ENTRY",
                    message=f"Duplicate entry found in package ZIP: '{info.filename}'.",
                )
            )
        seen_names.add(info.filename)

    # 3. Path traversal / Zip Slip protection
    for info in infolist:
        fname = info.filename
        if os.path.isabs(fname) or fname.startswith("/") or fname.startswith("\\"):
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file=fname,
                    code="PATH_TRAVERSAL_DETECTED",
                    message=f"ZIP entry '{fname}' uses an absolute path.",
                )
            )
        parts = fname.replace("\\", "/").split("/")
        if ".." in parts:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file=fname,
                    code="PATH_TRAVERSAL_DETECTED",
                    message=f"ZIP entry '{fname}' contains directory traversal sequences.",
                )
            )

    # 4. Header-level uncompressed size & compression ratio check
    total_declared_uncompressed = 0
    for info in infolist:
        if info.is_dir():
            continue
        total_declared_uncompressed += info.file_size
        if info.file_size > MAX_ZIP_SINGLE_FILE_BYTES:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file=info.filename,
                    code="FILE_SIZE_LIMIT_EXCEEDED",
                    message=f"File '{info.filename}' declared size {info.file_size} exceeds {MAX_ZIP_SINGLE_FILE_BYTES} bytes limit.",
                )
            )
        if info.compress_size > 0:
            ratio = info.file_size / info.compress_size
            if ratio > MAX_ZIP_COMPRESSION_RATIO:
                issues.append(
                    PackageValidationIssue(
                        severity="error",
                        file=info.filename,
                        code="COMPRESSION_RATIO_EXCEEDED",
                        message=f"File '{info.filename}' compression ratio {ratio:.1f}:1 exceeds maximum safe ratio {MAX_ZIP_COMPRESSION_RATIO}:1.",
                    )
                )

    if total_declared_uncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES:
        issues.append(
            PackageValidationIssue(
                severity="error",
                file="manifest.json",
                code="DECOMPRESSION_BOMB_EXCEEDED",
                message=f"ZIP total declared uncompressed size {total_declared_uncompressed} exceeds limit of {MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES} bytes.",
            )
        )

    # Check for forbidden vector dumps
    for name in namelist:
        if name.endswith(".npy") or name.endswith(".pt") or name.endswith(".bin") or "embeddings" in name.lower():
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file=name,
                    code="FORBIDDEN_VECTOR_FILE",
                    message=(
                        f"Package contains vector file '{name}'. Portable packages must omit dense vectors "
                        "and record regeneration instructions in manifest.json."
                    ),
                )
            )

    # Check for manifest
    if "manifest.json" not in namelist:
        issues.append(
            PackageValidationIssue(
                severity="error",
                file="manifest.json",
                code="MISSING_MANIFEST",
                message="Package ZIP does not contain 'manifest.json' at root.",
            )
        )

    if any(i.severity == "error" for i in issues):
        return PackageValidationReport(
            valid=False,
            totalFiles=len(namelist),
            issues=issues,
        )

    # Safe decompression helper with byte limit enforcement
    cumulative_decompressed_bytes = 0

    def safe_read_member(member_path: str) -> bytes:
        nonlocal cumulative_decompressed_bytes
        chunks = []
        member_bytes = 0
        with zip_file.open(member_path) as zf:
            while True:
                chunk = zf.read(64 * 1024)
                if not chunk:
                    break
                member_bytes += len(chunk)
                cumulative_decompressed_bytes += len(chunk)
                if member_bytes > MAX_ZIP_SINGLE_FILE_BYTES:
                    raise ValueError(f"Decompressed file '{member_path}' exceeds single file limit of {MAX_ZIP_SINGLE_FILE_BYTES} bytes.")
                if cumulative_decompressed_bytes > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES:
                    raise ValueError(f"Total decompressed bytes exceed safety limit of {MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES} bytes.")
                chunks.append(chunk)
        return b"".join(chunks)

    # Parse and validate manifest
    try:
        manifest_bytes = safe_read_member("manifest.json")
        manifest_dict = json.loads(manifest_bytes.decode("utf-8"))
        manifest = PackageManifest.model_validate(manifest_dict)
    except Exception as e:
        issues.append(
            PackageValidationIssue(
                severity="error",
                file="manifest.json",
                code="INVALID_MANIFEST_SCHEMA",
                message=f"Failed to parse manifest.json: {str(e)}",
            )
        )
        return PackageValidationReport(
            valid=False,
            totalFiles=len(namelist),
            issues=issues,
        )

    # Verify each file declared in manifest
    manifest_paths = set()
    for file_entry in manifest.files:
        manifest_paths.add(file_entry.path)
        if file_entry.path not in namelist:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file=file_entry.path,
                    code="MANIFEST_FILE_NOT_FOUND",
                    message=f"File '{file_entry.path}' declared in manifest is missing from ZIP.",
                )
            )
            continue

        try:
            actual_bytes = safe_read_member(file_entry.path)
        except ValueError as ve:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file=file_entry.path,
                    code="DECOMPRESSION_BOMB_EXCEEDED",
                    message=str(ve),
                )
            )
            return PackageValidationReport(valid=False, totalFiles=len(namelist), issues=issues)

        actual_len = len(actual_bytes)
        actual_sha = compute_sha256_bytes(actual_bytes)

        if actual_len != file_entry.bytes:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file=file_entry.path,
                    code="BYTE_SIZE_MISMATCH",
                    message=(
                        f"Byte size mismatch for '{file_entry.path}': "
                        f"manifest={file_entry.bytes}, actual={actual_len}"
                    ),
                )
            )

        if actual_sha != file_entry.sha256:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file=file_entry.path,
                    code="CHECKSUM_MISMATCH",
                    message=(
                        f"SHA-256 checksum mismatch for '{file_entry.path}': "
                        f"manifest={file_entry.sha256}, actual={actual_sha}"
                    ),
                )
            )

    # Check for undeclared files in ZIP
    for name in namelist:
        if name != "manifest.json" and name not in manifest_paths and not name.endswith("/"):
            issues.append(
                PackageValidationIssue(
                    severity="warning",
                    file=name,
                    code="UNDECLARED_FILE",
                    message=f"File '{name}' exists in ZIP but is not declared in manifest.json files array.",
                )
            )

    # Read and parse JSONL files to check referential integrity
    def read_jsonl(path: str) -> List[Dict[str, Any]]:
        if path not in namelist:
            return []
        try:
            lines = safe_read_member(path).decode("utf-8").splitlines()
        except Exception as e:
            issues.append(
                PackageValidationIssue(
                    severity="error",
                    file=path,
                    code="FILE_READ_ERROR",
                    message=f"Failed to read '{path}': {str(e)}",
                )
            )
            return []
        records = []
        for line_num, line in enumerate(lines, start=1):
            if not line.strip():
                continue
            try:
                records.append(json.loads(line))
            except Exception as e:
                issues.append(
                    PackageValidationIssue(
                        severity="error",
                        file=path,
                        code="INVALID_JSONL_LINE",
                        message=f"Line {line_num} in '{path}' is not valid JSON: {str(e)}",
                    )
                )
        return records

    blocks_data = read_jsonl("source/blocks.jsonl")
    chunks_data = read_jsonl("chunks/chunks.jsonl")
    questions_data = read_jsonl("evaluation/questions.jsonl")
    retrieval_data = read_jsonl("evaluation/retrieval-results.jsonl")
    answers_data = read_jsonl("evaluation/answers.jsonl")

    # Run referential integrity check on loaded records
    ref_issues = validate_referential_integrity(
        blocks=blocks_data,
        chunks=chunks_data,
        questions=questions_data,
        retrieval_results=retrieval_data,
        answers=answers_data,
    )
    issues.extend(ref_issues)

    is_valid = not any(i.severity == "error" for i in issues)

    return PackageValidationReport(
        valid=is_valid,
        formatVersion=manifest.formatVersion,
        totalFiles=len(namelist),
        totalBlocks=len(blocks_data),
        totalChunks=len(chunks_data),
        totalQuestions=len(questions_data),
        totalAnswers=len(answers_data),
        issues=issues,
        manifest=manifest,
    )
