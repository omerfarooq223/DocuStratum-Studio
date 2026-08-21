# WebRAG Studio — Release Candidate v0.1.0 (Day 10)

**Release Date:** August 21, 2026  
**Build Tag:** `v0.1.0-rc1`  
**Git Commit / Tag:** `git tag -a v0.1.0-rc1 -m "WebRAG Studio Release Candidate 1"`  
**Target Platform:** Chrome / Chromium (Manifest V3), Python 3.9+ (FastAPI + SentenceTransformers)

---

## 1. Executive Summary

WebRAG Studio is a local-first, privacy-preserving browser extension and backend engine for Retrieval-Augmented Generation. It empowers engineers and researchers to inspect, debug, and package web content into reproducible, portable RAG datasets with strict source-to-answer provenance, verified grounded citations, and zero vector locking.

---

## 2. Core Capabilities & Differentiators

| Capability | Engineering Implementation | Production Guarantee |
|---|---|---|
| **Deterministic Capture** | Semantic DOM parsing with structural paths, CSS selectors, text quotes, and SHA-256 content hashes. | User-initiated, least-privilege via `activeTab`/`scripting`. Forms, scripts, and secrets stripped. |
| **Dual-Strategy Chunking** | 1. Recursive character chunking (with configurable overlap).<br>2. Heading-aware chunking (preserving document hierarchy). | Visual boundary inspection and comparison diffs in side panel. |
| **Local Vector Retrieval** | `all-MiniLM-L6-v2` embeddings run locally on CPU/Metal with deterministic cosine similarity search and tie-breaking. | Exact source highlight on origin page with stale-anchor fallback. |
| **Grounded LLM Generation** | Groq Llama 3.3 70B integration with strict structured prompts, untrusted context isolation, and citation validators. | Hallucinated citations stripped. Graceful degradation when offline or unconfigured. |
| **Portable RAG Package** | Open ZIP archive with `manifest.json`, `source/blocks.jsonl`, `chunks/chunks.jsonl`, `evaluation/`, and `README.md`. | Complete referential integrity, SHA-256 checksum validation, and zero credentials committed. |
| **Zero-Dependency Loader** | Python loader (`service/packager/loader.py`) with zero external dependencies (standard library only). | Ready for downstream vector databases (Chroma, FAISS, Qdrant). |

---

## 3. Reliability & Security Hardening (Day 9 & Day 10)

- **Strict Resource Limits:** 5 MB max request size, max 1,000 blocks, max 2,000 chunks, max 50 LLM context chunks.
- **Privacy-Preserving Logs:** Event logging outputs timestamp, request ID, status, latency, and error code. Zero page text or prompts logged.
- **Origin Isolation:** Restricted CORS (loopback development servers and Chrome extension IDs only).
- **Adversarial Resilience:** Robust against prompt injections, hidden text, and script payloads.
- **Fail-Safe Persistence:** Automatic draft restoration across panel reloads with corrupt draft isolation.

---

## 4. Release Artifacts & Checksums

All build artifacts are verified and checksummed in `dist/SHA256SUMS.txt`:

```text
dist/
├── assets/
│   ├── hash-*.js
│   ├── sidepanel-*.css
│   └── sidepanel-*.js
├── background.js
├── content.js
├── src/sidepanel/index.html
├── release/
│   └── webrag-sample-rc1.zip
└── SHA256SUMS.txt
```

---

## 5. Verification Commands

```bash
# 1. Full clean-install & automated verification
bash scripts/validate-release.sh

# 2. Package self-validation
python3 scripts/validate-package.py dist/release/webrag-sample-rc1.zip

# 3. Retrieval benchmark
npm run benchmark:retrieval
```

---

## 6. Known Scope Boundaries

1. **Embedding Storage:** Dense float vectors are omitted from exported ZIP packages by design; vectors are regenerated deterministically downstream.
2. **Provider Scope:** Groq adapter included with server-side API key isolation. Local Ollama and OpenAI-compatible adapters plug into the same provider interface.
3. **Capture Scope:** Focused on static & client-rendered DOM accessible within active tab context; background pagination crawler omitted by design.
