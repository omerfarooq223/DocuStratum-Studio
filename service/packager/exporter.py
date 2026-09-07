import io
import json
import zipfile
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone

from service.models import (
    CaptureResultModel,
    BlockModel,
    ChunkModel,
    TestQuestionModel,
    RetrievalEvaluationResultModel,
    GroundedAnswerResponse,
    GenerationMetadata,
    ChunkerRecursiveSettings,
    ChunkerHeadingAwareSettings,
    EmbeddingMetadata,
    ManifestFileEntry,
    PackageManifest,
)
from service.packager.manifest import create_manifest, compute_sha256_bytes
from service.packager.validator import validate_referential_integrity


def generate_cleaned_markdown_from_blocks(blocks: List[BlockModel]) -> str:
    """Generates clean Markdown from ordered, included semantic blocks."""
    lines: List[str] = []
    for b in blocks:
        if not b.included:
            continue
        content = b.content.strip()
        if not content:
            continue

        if b.type == "heading":
            level = b.attributes.headingLevel if b.attributes and b.attributes.headingLevel else 2
            lines.append(f"{'#' * level} {content}\n")
        elif b.type == "code":
            lang = b.attributes.codeLanguage if b.attributes and b.attributes.codeLanguage else ""
            lines.append(f"```{lang}\n{content}\n```\n")
        elif b.type == "callout":
            quote_lines = "\n".join([f"> {l}" for l in content.splitlines()])
            lines.append(f"{quote_lines}\n")
        elif b.type == "table":
            lines.append(f"{content}\n")
        else:
            lines.append(f"{content}\n")

    return "\n".join(lines).strip() + "\n"


def generate_package_readme(
    manifest_preview: Dict[str, Any],
    total_blocks: int,
    total_chunks: int,
    total_questions: int,
    total_answers: int,
) -> str:
    """Generates the README.md explaining package contents and consumption."""
    src = manifest_preview.get("sourceIdentity", {})
    emb = manifest_preview.get("embeddingMetadata", {})
    return f"""# DocuStratum Portable Package

- **Source URL:** {src.get('url', 'N/A')}
- **Page Title:** {src.get('title', 'N/A')}
- **Captured At:** {src.get('captureTime', 'N/A')}
- **Format Version:** {manifest_preview.get('formatVersion', '1.0.0')}
- **Extractor Version:** {src.get('extractorVersion', '1.0.0')}

## Package Summary

| Component | Count | Description |
|---|---|---|
| Blocks | {total_blocks} | Cleaned semantic DOM blocks (`source/blocks.jsonl`) |
| Chunks | {total_chunks} | Deterministic chunks with block spans (`chunks/chunks.jsonl`) |
| Questions | {total_questions} | Evaluation questions with expected blocks (`evaluation/questions.jsonl`) |
| Answers | {total_answers} | Grounded answers with verified citations (`evaluation/answers.jsonl`) |

## Embedding & Regeneration

Dense vector embeddings are omitted from this portable package to ensure vendor neutrality and lightweight storage.
To regenerate embeddings:

- **Model:** `{emb.get('modelName', 'all-MiniLM-L6-v2')}`
- **Dimensions:** `{emb.get('dimension', 384)}`
- **Distance Metric:** `{emb.get('metric', 'cosine')}`
- **Normalized:** `{emb.get('normalized', True)}`

## Quick Start (Zero-Dependency Python Loader)

```python
from service.packager.loader import RAGPackage

# Open the portable package ZIP
with RAGPackage.open("webrag-package.zip") as pkg:
    # 1. Self-validate checksums and referential integrity
    report = pkg.validate()
    print("Package Valid:", report.valid)

    # 2. Iterate chunks with complete provenance
    for chunk in pkg.iter_chunks():
        prov = pkg.get_chunk_with_provenance(chunk["id"])
        print(f"Chunk {{chunk['id']}} (Strategy: {{chunk['strategy']}})")
        print(f"Heading: {{' > '.join(chunk['headingPath'])}}")
        print(f"Source Blocks: {{[b['id'] for b in prov['sourceBlocks']]}}")
```

## Referential Integrity & Checksums

All files are cryptographically signed with SHA-256 digests in `manifest.json`.
Every chunk's `sourceBlockIds` strictly resolve to valid block entries in `source/blocks.jsonl`.
All answer citations strictly resolve to chunk IDs in `chunks/chunks.jsonl`.
"""


class PackageExporter:
    """Builds, validates, and serializes portable WebRAG ZIP archives."""

    @staticmethod
    def build_package_zip(
        capture_result: CaptureResultModel,
        chunks: List[ChunkModel],
        questions: Optional[List[TestQuestionModel]] = None,
        retrieval_results: Optional[List[RetrievalEvaluationResultModel]] = None,
        answers: Optional[List[GroundedAnswerResponse]] = None,
        generation_metadata: Optional[GenerationMetadata] = None,
        recursive_settings: Optional[ChunkerRecursiveSettings] = None,
        heading_aware_settings: Optional[ChunkerHeadingAwareSettings] = None,
        embedding_meta: Optional[EmbeddingMetadata] = None,
        cleaned_markdown_override: Optional[str] = None,
    ) -> Tuple[bytes, PackageManifest]:
        """
        Validates all entities and builds a standard portable RAG ZIP archive.
        Raises ValueError if referential integrity or validation errors are detected.
        """
        questions = questions or []
        retrieval_results = retrieval_results or []
        answers = answers or []

        # 1. Pre-export referential integrity check
        issues = validate_referential_integrity(
            blocks=capture_result.blocks,
            chunks=chunks,
            questions=questions,
            retrieval_results=retrieval_results,
            answers=answers,
        )
        errors = [i for i in issues if i.severity == "error"]
        if errors:
            err_msg = "; ".join([f"[{e.code}] {e.message}" for e in errors])
            raise ValueError(f"Package validation failed: {err_msg}")

        # 2. Prepare payload contents in memory
        files_data: Dict[str, Tuple[bytes, Optional[int]]] = {}

        # 2a. source/cleaned.md
        cleaned_md = cleaned_markdown_override or generate_cleaned_markdown_from_blocks(capture_result.blocks)
        cleaned_md_bytes = cleaned_md.encode("utf-8")
        files_data["source/cleaned.md"] = (cleaned_md_bytes, None)

        # 2b. source/blocks.jsonl
        blocks_lines = [b.model_dump_json() for b in capture_result.blocks]
        blocks_bytes = ("\n".join(blocks_lines) + ("\n" if blocks_lines else "")).encode("utf-8")
        files_data["source/blocks.jsonl"] = (blocks_bytes, len(capture_result.blocks))

        # 2c. chunks/chunks.jsonl
        chunks_lines = [c.model_dump_json() for c in chunks]
        chunks_bytes = ("\n".join(chunks_lines) + ("\n" if chunks_lines else "")).encode("utf-8")
        files_data["chunks/chunks.jsonl"] = (chunks_bytes, len(chunks))

        # 2d. evaluation/questions.jsonl
        questions_lines = [q.model_dump_json() for q in questions]
        questions_bytes = ("\n".join(questions_lines) + ("\n" if questions_lines else "")).encode("utf-8")
        files_data["evaluation/questions.jsonl"] = (questions_bytes, len(questions))

        # 2e. evaluation/retrieval-results.jsonl
        retrieval_lines = [r.model_dump_json() for r in retrieval_results]
        retrieval_bytes = ("\n".join(retrieval_lines) + ("\n" if retrieval_lines else "")).encode("utf-8")
        files_data["evaluation/retrieval-results.jsonl"] = (retrieval_bytes, len(retrieval_results))

        # 2f. evaluation/answers.jsonl
        answers_lines = [a.model_dump_json() for a in answers]
        answers_bytes = ("\n".join(answers_lines) + ("\n" if answers_lines else "")).encode("utf-8")
        files_data["evaluation/answers.jsonl"] = (answers_bytes, len(answers))

        # 2g. README.md preview and serialization
        preview_meta = {
            "formatVersion": "1.0.0",
            "sourceIdentity": {
                "url": capture_result.capture.url,
                "title": capture_result.capture.title,
                "captureTime": capture_result.capture.timestamp,
                "extractorVersion": capture_result.capture.extractorVersion,
            },
            "embeddingMetadata": (embedding_meta or EmbeddingMetadata()).model_dump(),
        }
        readme_str = generate_package_readme(
            manifest_preview=preview_meta,
            total_blocks=len(capture_result.blocks),
            total_chunks=len(chunks),
            total_questions=len(questions),
            total_answers=len(answers),
        )
        readme_bytes = readme_str.encode("utf-8")
        files_data["README.md"] = (readme_bytes, None)

        # 3. Create Manifest File Entries
        file_entries: List[ManifestFileEntry] = []
        for path, (data_bytes, record_count) in files_data.items():
            file_entries.append(
                ManifestFileEntry(
                    path=path,
                    sha256=compute_sha256_bytes(data_bytes),
                    bytes=len(data_bytes),
                    recordCount=record_count,
                )
            )

        # 4. Generate manifest.json
        manifest = create_manifest(
            capture=capture_result.capture,
            file_entries=file_entries,
            recursive_settings=recursive_settings,
            heading_aware_settings=heading_aware_settings,
            embedding_meta=embedding_meta,
            generation_meta=generation_metadata,
        )
        manifest_bytes = manifest.model_dump_json(indent=2).encode("utf-8")

        # 5. Build in-memory ZIP archive
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            # Write manifest.json at root
            zf.writestr("manifest.json", manifest_bytes)
            # Write all other files
            for path, (data_bytes, _) in files_data.items():
                zf.writestr(path, data_bytes)

        return zip_buffer.getvalue(), manifest
