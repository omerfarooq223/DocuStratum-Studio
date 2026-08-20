# WebRAG Studio

WebRAG Studio is a local-first Chrome extension and companion service for deterministic web content extraction, semantic block structuring, chunk comparison, and local vector retrieval. It provides transparent, reproducible retrieval with end-to-end provenance linking every retrieved result back to its exact source DOM element.

---

## Key Features

### 1. Safe DOM Capture & Provenance Tracking
- **Multiple Capture Modes**: Capture selected text, an interactive element via visual picker, or the cleaned main page content.
- **Semantic Block Tree**: Converts web pages into structured semantic blocks (`heading`, `paragraph`, `list`, `code`, `table`, `callout`).
- **Privacy-First Sanitization**: Automatically excludes scripts, styles, navigation bars, hidden elements, editable fields, password inputs, and sensitive form values.
- **Resilient Source Anchors**: Preserves source URL, capture timestamp, CSS selector, node path, heading hierarchy, and cryptographic content hashes for every block.

### 2. Interactive Review & Cleaned Markdown
- **Live Block Inspection**: View the parsed semantic hierarchy before chunking or embedding.
- **Inclusion Controls**: Include or exclude individual blocks or entire sections with bulk actions and instant state restoration.
- **Live Markdown Generation**: Automatically generates clean, standardized Markdown from included blocks with extraction metrics (character counts, block types, inclusion ratios).

### 3. Deterministic Chunking & Visual Comparison
- **Parallel Chunking Strategies**:
  - **Recursive Splitter**: Configurable window sizes and sliding overlaps with boundary-aware separators (paragraphs, lines, sentences, words).
  - **Heading-Aware Splitter**: Preserves heading hierarchies and structural sections intact with zero overlap and continuation tracking for oversized tables, lists, and code blocks.
- **Visual Comparison**: Side-by-side view comparing chunk counts, character size distribution histograms, overlaps, and block relationships.
- **Deterministic Stable IDs**: Reproducible chunk identifiers generated from namespace, strategy, heading path, and content hashes.

### 4. Local Neural Embeddings & In-Memory Vector Search
- **100% Local & Private**: Powered by `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions) running on local CPU or Apple Silicon (`mps`). Zero text is transmitted over the network during embedding or search.
- **Embedding Cache**: Content-hash-keyed in-memory cache eliminates redundant neural computations for unchanged chunks.
- **Normalized Cosine Similarity**: Fast in-memory dot-product search with deterministic tie-breaking for reproducible rankings.
- **Top-5 Visual Retrieval**: Dedicated search interface displaying rank badges, similarity score percentage bars, strategy pills, heading breadcrumbs, and clickable source block tags.

### 5. Grounded Answers, Evaluation, and Portable Export
- **Evidence-Only Answers**: Optional Groq/OpenAI-compatible generation receives only retrieved chunks, rejects unknown citations, and explicitly reports insufficient evidence.
- **Retrieval Debugger**: Curated questions, expected-block labels, hit@k, reciprocal rank, latency, live-page highlighting, and stale-source fallback.
- **Portable RAG ZIP**: Exports checksummed Markdown, blocks, chunks, evaluation records, answers, manifest metadata, and a dependency-light Python loader. Dense vectors and credentials are intentionally omitted.
- **Failure-Safe by Default**: Capture, chunking, retrieval, evaluation, highlighting, and export remain available when the optional LLM is disabled or offline.

---

## Architecture

```text
Web Page
  ├── Content Script (Selection / Element Picker / Page Capture)
  └── Side Panel (React + TypeScript + Vite)
        ├── Block Review & Cleaned Markdown
        ├── Deterministic Chunk Comparison
        └── Local Retrieval & Provenance Debugger
              │
              ▼ (HTTP / REST)
Local FastAPI Companion Service (Python 3.10+)
  ├── Embeddings Engine (all-MiniLM-L6-v2, 384d)
  ├── Embedding Cache (SHA-256 hash indexing)
  ├── Vector Similarity Search (NumPy Cosine Similarity)
  └── Schema Contract & Validation (Pydantic / JSON Schema)
```

---

## Project Structure

```text
WebRAG/
├── extension/                     # Manifest V3 Chrome Extension
│   ├── src/
│   │   ├── background/            # MV3 background service worker
│   │   ├── capture/               # DOM traversal, element picker & sanitizers
│   │   ├── chunking/              # Recursive & heading-aware deterministic chunkers
│   │   ├── content/               # Content script & DOM interaction listeners
│   │   ├── retrieval/             # Local embedding service API client
│   │   └── sidepanel/             # Side panel React application & components
│   └── manifest.json              # Chrome extension manifest
├── service/                       # Local FastAPI companion backend
│   ├── embeddings.py              # EmbeddingEngine singleton & vector search
│   ├── main.py                    # REST API routes (/health, /embed, /search, /model/status)
│   ├── models.py                  # Pydantic schemas and contract validation
│   └── tests/                     # Backend pytest test suite
├── packages/schema/               # Shared JSON schemas and TypeScript definitions
├── fixtures/                      # Local HTML test fixtures
├── docs/                          # Architecture decision records & specifications
└── scripts/
    └── check-all.sh               # Unified quality gate and test runner
```

---

## Quickstart Guide

### Prerequisites
- **Node.js**: v18.0.0 or later (with `npm`)
- **Python**: v3.10 or later
- **Google Chrome**: Version 116+ (with Side Panel support)

---

### Step 1: Set Up and Start the Companion Service

1. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r service/requirements.txt
   ```

3. Start the local companion service:
   ```bash
   uvicorn service.main:app --host 127.0.0.1 --port 8000 --reload
   ```

4. Verify service health:
   ```bash
   curl http://127.0.0.1:8000/health
   ```

5. Optional grounded answers: set the key only in the service process, then restart it:
   ```bash
   export GROQ_API_KEY="your-key"
   uvicorn service.main:app --host 127.0.0.1 --port 8000
   ```
   The key is never sent to the extension, browser storage, logs, or exported packages. Without it, the full deterministic workflow remains available.

---

### Step 2: Build and Load the Chrome Extension

1. Install extension dependencies:
   ```bash
   cd extension
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load the unpacked extension into Chrome:
   - Open Google Chrome and navigate to `chrome://extensions`.
   - Enable **Developer mode** (toggle in the top-right corner).
   - Click **Load unpacked** and select the `extension/dist` directory.
   - Click the extension icon in the toolbar to open the Side Panel.

---

## Running Tests & Quality Checks

Run the complete automated quality suite across both TypeScript and Python:

```bash
# Run all backend tests, frontend tests, and extension build
bash scripts/check-all.sh
```

Or run individual test suites:

```bash
# Python service tests
PYTHONPATH=. .venv/bin/pytest service/tests -v

# Frontend unit & component tests
cd extension && npm test

# Chunking-specific tests
cd extension && npm run test:chunking

# Retrieval-specific tests
cd extension && npm run test:retrieval

# Day 9 golden path, required to pass three consecutive times
npm run smoke:day9
```

## 60–90 Second Demo

1. Start the service, load the unpacked extension, and open `fixtures/demo-fixture.html`.
2. Capture the full page and point out that the form and secret values were excluded.
3. Compare recursive and heading-aware chunks.
4. Search for `How long is a token valid?`, open the top result, and show the exact source highlight.
5. Export and validate the portable ZIP. If Groq is configured, generate a grounded answer and open its citation.

The deterministic capture-to-export path is the no-network fallback. See [Day 9 reliability notes](docs/day-9-reliability-security-polish.md) for the adversarial and fresh-start checklists.

---

## API Reference

### Companion Service Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | Service liveness probe, version, and schema compatibility |
| `/version` | `GET` | Supported capture modes and chunking strategies |
| `/model/status` | `GET` | Embedding model readiness, device (`mps`/`cpu`), dimension (`384`), and cache stats |
| `/embed` | `POST` | Generate normalized embeddings for chunks or raw texts |
| `/search` | `POST` | Execute local cosine similarity search across candidate chunks |
| `/retrieval/query` | `POST` | Run a measured debugger retrieval query |
| `/evaluation/draft-questions` | `POST` | Create editable local question drafts from selected blocks |
| `/llm/status` | `GET` | Report optional provider readiness without exposing credentials |
| `/llm/answer` | `POST` | Generate a citation-validated grounded answer |
| `/llm/answer/stream` | `POST` | Stream a grounded answer with recoverable error events |
| `/export/package` | `POST` | Build a validated portable RAG ZIP |
| `/package/validate` | `POST` | Verify ZIP checksums and referential integrity |

---

## Security & Privacy Policy

- **No Remote Network Requests**: Content extraction, chunking, embedding generation, and similarity ranking execute entirely on your machine.
- **Sensitive Data Exclusion**: Form inputs with passwords, auth tokens, hidden fields, and scripts are strictly excluded at DOM traversal time.
- **Isolated Storage**: Capture drafts and evaluation states reside solely in browser local storage and the local companion process.
- **Least-Privilege Capture**: Page code is injected only after an explicit capture action under `activeTab`; there is no persistent all-sites content script.
- **Bounded Local API**: Requests are capped at 5 MB, with explicit block, chunk, text, and LLM-context limits.
- **Metadata-Only Logs**: Service logs record request IDs, event names, status, and duration—not page text, prompts, authorization headers, or API keys.

## Portable Package

The ZIP contains `manifest.json`, cleaned Markdown, blocks/chunks JSONL, evaluation JSONL, answer JSONL, and a package README. Validate and inspect it with:

```bash
python3 -m service.examples.similarity_search_example path/to/webrag-package.zip
```

The exact format and zero-dependency loader are documented in [Day 8 portable package](docs/day-8-portable-rag-package.md).

## Troubleshooting

- **Header shows OFFLINE**: Confirm the service is listening on `127.0.0.1:8000`, then click the status badge to retry.
- **Capture cannot start**: Browser-internal pages and the Chrome Web Store are restricted. Open an ordinary `http`, `https`, or local fixture page and retry.
- **Model is not ready**: Keep the service online for the first local model download. Once cached, retrieval works without network access.
- **Groq action is unavailable**: Set `GROQ_API_KEY` in the service environment. Do not place it in extension files or browser storage.
- **Request is too large**: Capture a smaller element or exclude blocks. The service caps request bodies at 5 MB, captures at 1,000 blocks, and chunk sets at 2,000.
- **Source highlight is stale**: The page changed after capture. Use the saved block preview or recapture the page.

## Known Limitations

WebRAG Studio intentionally supports one ordinary HTML page at a time, English text, and simple tables. It does not crawl sites or handle PDFs, OCR, canvases, shadow DOM, or authenticated automation. Retrieval is in-memory and sized for a single-page portfolio demo. Optional LLM latency depends on the provider and network; local retrieval timing is reported separately.

---

## License

This project is licensed under the MIT License.
