# Day 8 — Build and Validate the Portable RAG Package

## 1. File Structure and Purpose

```text
WebRAG/
├── packages/schema/
│   └── index.ts                                   # TypeScript interfaces: PackageManifest, ExportPackageRequest, PackageValidationReport
├── service/
│   ├── models.py                                  # Pydantic models for package manifests, file entries, validation reports, and export payloads
│   ├── packager/
│   │   ├── __init__.py                            # Packager module exports
│   │   ├── manifest.py                            # Cryptographic SHA-256 file hashing, manifest metadata builder, format versioning (v1.0.0)
│   │   ├── validator.py                           # Referential integrity (no dangling references), checksum, and ZIP archive validation
│   │   ├── exporter.py                            # In-memory ZIP archive generation (cleaned.md, blocks.jsonl, chunks.jsonl, evaluation sets)
│   │   └── loader.py                              # Zero-dependency Python reader (RAGPackage) with chunk-to-block provenance resolution
│   ├── examples/
│   │   ├── similarity_search_example.py           # Downstream integration: re-embeds package chunks and runs similarity search
│   │   └── chroma_import_example.py               # Downstream integration: imports package chunks into a local ChromaDB collection
│   ├── main.py                                    # Endpoints: POST /export/package, POST /package/validate
│   └── tests/test_day_8_export.py                 # Backend test suite (checksums, referential integrity, round-trip, vector omission, endpoints)
├── extension/
│   └── src/sidepanel/
│       ├── utils/
│       │   └── exportClient.ts                    # Client for triggering package export, blob download, and ZIP validation
│       ├── components/
│       │   └── ExportPackagePanel.tsx             # Side panel tab for package review, ZIP export, file integrity checks, and Python snippets
│       └── __tests__/
│           └── export-package.test.tsx            # Component unit tests for export actions and validation reporting
└── docs/day-8-portable-rag-package.md             # This architecture, format specification, and validation guide
```

---

## 2. Portable RAG Package Layout

An exported WebRAG package is a standard ZIP archive containing human-readable Markdown and newline-delimited JSON (`.jsonl`) files:

```text
webrag-package.zip
├── manifest.json                                  # Package metadata, cryptographic checksums, chunker & embedding specifications
├── README.md                                      # Human-readable summary, re-embedding instructions, and Python usage snippet
├── source/
│   ├── cleaned.md                                 # Continuous cleaned Markdown document extracted from included blocks
│   └── blocks.jsonl                               # Ordered semantic DOM blocks with complete HTML/CSS source anchors
├── chunks/
│   └── chunks.jsonl                               # Deterministic chunks with block ID references, token counts, and overlaps
└── evaluation/
    ├── questions.jsonl                            # Curated & generated evaluation questions with expected block mappings
    ├── retrieval-results.jsonl                    # Recorded vector retrieval runs, hit@k metrics, and top results
    └── answers.jsonl                              # Grounded LLM answers with verified chunk citations
```

---

## 3. Package Manifest Specification (`manifest.json`)

The manifest is the cryptographic and semantic source of truth for the portable package:

```json
{
  "formatVersion": "1.0.0",
  "createdAt": "2026-08-19T10:00:00Z",
  "sourceIdentity": {
    "url": "https://example.com/docs/auth",
    "canonicalUrl": "https://example.com/docs/auth",
    "title": "Authentication & Security Guide",
    "mode": "page",
    "captureTime": "2026-08-19T09:58:00Z",
    "extractorVersion": "1.0.0",
    "captureHash": "b3a4f8...sha256"
  },
  "chunkerSettings": {
    "recursive": {
      "maxCharacters": 700,
      "overlapCharacters": 80
    },
    "headingAware": {
      "maxCharacters": 700
    }
  },
  "embeddingMetadata": {
    "modelName": "all-MiniLM-L6-v2",
    "dimension": 384,
    "metric": "cosine",
    "normalized": true,
    "instructions": "Re-embed chunks using the specified model and metric to generate dense retrieval vectors."
  },
  "generationMetadata": {
    "provider": "groq",
    "model": "llama-3.3-70b-versatile",
    "promptVersion": "v1.0.0",
    "temperature": 0.1
  },
  "promptVersion": "v1.0.0",
  "licenseNote": "Content captured from user-specified web source. Ensure compliance with origin source copyright, licensing, and terms of service.",
  "files": [
    {
      "path": "source/cleaned.md",
      "sha256": "4a5c9b...",
      "bytes": 2048,
      "recordCount": null
    },
    {
      "path": "source/blocks.jsonl",
      "sha256": "8f12ac...",
      "bytes": 6124,
      "recordCount": 12
    },
    {
      "path": "chunks/chunks.jsonl",
      "sha256": "2d98ea...",
      "bytes": 4510,
      "recordCount": 8
    },
    {
      "path": "evaluation/questions.jsonl",
      "sha256": "7c41be...",
      "bytes": 890,
      "recordCount": 3
    },
    {
      "path": "evaluation/retrieval-results.jsonl",
      "sha256": "3a19bc...",
      "bytes": 1420,
      "recordCount": 3
    },
    {
      "path": "evaluation/answers.jsonl",
      "sha256": "e67210...",
      "bytes": 1100,
      "recordCount": 2
    },
    {
      "path": "README.md",
      "sha256": "9b34fa...",
      "bytes": 1500,
      "recordCount": null
    }
  ]
}
```

---

## 4. Key Design Decisions & Learning Explanations

### Why Every Field in `manifest.json` Matters
1. **`formatVersion`**: Guarantees backwards and forwards schema compatibility when external ingestion pipelines parse the ZIP package.
2. **`sourceIdentity`**: Records the exact origin URL, title, capture mode, extraction timestamp, and extractor version to preserve legal, provenance, and freshness context.
3. **`chunkerSettings`**: Documents the exact segmentation parameters (character limits, overlap) so downstream consumers understand boundary semantics.
4. **`embeddingMetadata`**: Specifies the embedding model (`all-MiniLM-L6-v2`), dimension (384), and distance metric (cosine) required to deterministically reproduce vector spaces.
5. **`generationMetadata` & `promptVersion`**: Documents the LLM architecture and prompt contract without storing any secrets or proprietary credentials.
6. **`files` Checksum Table**: Every packaged file has an exact byte count and cryptographic SHA-256 hash to detect data corruption, tampering, or incomplete downloads.

### Strict Referential Integrity Validation
Before any ZIP is generated, `service/packager/validator.py` enforces five integrity rules:
1. **Block Uniqueness**: Every block has a unique `id`.
2. **No Dangling Blocks in Chunks**: Every block ID in `chunk.sourceBlockIds` must resolve to an existing block in `source/blocks.jsonl`.
3. **No Dangling Expected Blocks**: Every `expectedBlockId` in `evaluation/questions.jsonl` must resolve to a valid block in `source/blocks.jsonl`.
4. **No Dangling Retrieval References**: Every `chunkId` in retrieval evaluation runs must resolve to a chunk in `chunks/chunks.jsonl`.
5. **No Dangling Citations in Answers**: Every citation ID in `evaluation/answers.jsonl` must resolve to a valid chunk ID in `chunks/chunks.jsonl`.

### Vendor Neutrality in Practice
- **No Proprietary Binary Dumps**: The package uses open JSON Lines (`.jsonl`) and Markdown (`.md`), not proprietary database snapshots or vendor-locked formats.
- **Dense Vectors are Omitted**: Raw vector embeddings are excluded from the archive because vector formats differ between vector databases (e.g. Chroma, Qdrant, Pinecone, FAISS) and would bloat package size. The manifest specifies the exact model parameters to regenerate embeddings deterministically in one line.
- **Zero-Credential Isolation**: The exporter strictly sanitizes generation metadata to guarantee that no `GROQ_API_KEY`, Bearer tokens, or environment credentials are ever written into exported packages.

---

## 5. Downstream Consumption Guide

### Zero-Dependency Python Loader (`RAGPackage`)

The loader uses Python standard library modules (`zipfile`, `json`, `hashlib`, `pathlib`) and requires **zero external dependencies**:

```python
from service.packager.loader import RAGPackage

with RAGPackage.open("webrag-package.zip") as pkg:
    # 1. Self-validate cryptographic checksums and referential integrity
    report = pkg.validate()
    print("Package Valid:", report.valid)

    # 2. Iterate chunks with complete source provenance
    for chunk in pkg.iter_chunks():
        prov = pkg.get_chunk_with_provenance(chunk["id"])
        print(f"Chunk: {chunk['id']} (Strategy: {chunk['strategy']})")
        print(f"Heading: {' > '.join(chunk['headingPath'])}")
        print(f"Source Blocks: {[b['id'] for b in prov['sourceBlocks']]}")
```

### Downstream Similarity Search Example
Run the standalone integration example:

```bash
python3 -m service.examples.similarity_search_example path/to/package.zip
```

### Optional ChromaDB Import Example
Run the local Chroma vector store importer:

```bash
python3 -m service.examples.chroma_import_example path/to/package.zip
```

---

## 6. Acceptance Gate Checklist

| Requirement | Implementation & Verification Status |
|---|---|
| **Clean Python Loader** | `RAGPackage` loads any package ZIP with zero 3rd-party dependencies and prints chunks with complete block provenance. |
| **Manifest Checksums Match** | Pre-export and post-export SHA-256 verification validates all file sizes and digests. |
| **Referential Integrity** | Dangling block references, invalid retrieval chunk IDs, and hallucinated answer citations are rejected prior to export. |
| **Zero Credentials Leaked** | Generation metadata strictly strips authorization tokens, API keys, and private headers. |
| **Deterministic Re-Export** | Re-exporting unchanged content produces byte-equivalent data structures with documented volatile timestamps. |
| **Vector Omission Guarantee** | Dense vectors are omitted from the ZIP archive; embedding regeneration metadata is recorded in `manifest.json`. |
| **Automated Test Coverage** | 31 Python backend tests and 14 extension test files passing with 100% success rate. |
