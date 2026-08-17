# Day 5 — Local Embeddings and Vector Retrieval

## 1. File structure and purpose

```text
WebRAG/
├── packages/schema/
│   ├── index.ts                               # ModelStatusResponse, EmbedRequest/Response, SearchRequest/Response, RetrievalResult
│   └── retrieval.json                         # JSON Schema for RetrievalResult provenance and scores
├── service/
│   ├── requirements.txt                       # Pinned sentence-transformers>=3.0.0 and numpy>=1.26.0
│   ├── models.py                              # Pydantic models for SearchRequest, SearchResponse, EmbedResponse, ModelStatusResponse
│   ├── embeddings.py                          # EmbeddingEngine singleton, all-MiniLM-L6-v2, caching, cosine similarity, tie-breaking
│   ├── main.py                                # Endpoints: GET /model/status, POST /embed, POST /search with validation handlers
│   └── tests/test_day_5_retrieval.py          # Python retrieval test suite (normalization, cache, top-5 ranking, tie-breaking)
├── extension/
│   ├── package.json                           # test:retrieval vitest command
│   └── src/
│       ├── retrieval/
│       │   └── client.ts                      # Client library for local companion service embeddings & search
│       └── sidepanel/
│           ├── App.tsx                        # Integrated Retrieve tab, chunk sync, block highlight callbacks
│           ├── styles.css                     # Sleek dark-mode styling for search bar, score pills, rank badges, result cards
│           ├── components/
│           │   ├── RetrievalView.tsx          # Model status banner, query input, strategy filter, suggested queries, top-5 list
│           │   └── SearchResultCard.tsx       # Individual result card: rank, cosine score meter, strategy, heading path, excerpt, source block tags
│           └── __tests__/
│               └── retrieval.test.tsx         # Vitest component tests for SearchResultCard and RetrievalView
├── docs/day-5-local-embeddings-retrieval.md   # This design, vector mathematics, and validation runbook
└── package.json                               # Root test:retrieval command
```

---

## 2. Architecture & Design Rationale

### Model Selection: `sentence-transformers/all-MiniLM-L6-v2`
- **Identifier**: `all-MiniLM-L6-v2` (pinned).
- **Dimension**: `384` float32 dimensions.
- **Size**: ~80 MB weights on local disk.
- **Privacy & Latency**: 100% local CPU / Apple Silicon MPS execution. Zero external network calls are made during inference or search.
- **Cold-Start Warm-up**: On startup / first invocation, the engine runs a lightweight warm-up query (`"WebRAG warm-up query"`) to prime the neural network and avoid user query cold-start lag.

### Embedding Cache Architecture
To achieve sub-15ms local search and eliminate redundant re-computation of unchanged chunks:
- The engine maintains an in-memory cache keyed by `f"{model_name}:{sha256(chunk.content)}"`.
- Chunks with identical content hashes immediately reuse cached vectors.
- Only new or modified chunks pass through the neural transformer encoder.

### Vector Mathematics & Cosine Similarity
1. **L2 Normalization**: All chunk and query vectors are unit-normalized ($||\vec{v}||_2 = 1.0$) upon encoding.
2. **Cosine Similarity**: With unit vectors, cosine similarity simplifies directly to the dot product:
   $$\text{sim}(\vec{q}, \vec{c}_i) = \vec{q} \cdot \vec{c}_i = \sum_{j=1}^{384} q_j \cdot c_{i,j}$$
3. **Deterministic Tie-Breaking**:
   To guarantee identical ranking across runs and prevent floating-point order jitter:
   - Scores are rounded to 4 decimal places for ranking stability.
   - Candidates are sorted by: `(-score, sequence, chunk_id)`.
   - Any score ties are deterministically broken by chunk sequence and stable string chunk ID.

---

## 3. API Contract & Endpoints

### `GET /model/status`
Returns model readiness, device, dimensions, and cache diagnostics:
```json
{
  "status": "ready",
  "modelName": "all-MiniLM-L6-v2",
  "dimension": 384,
  "device": "mps",
  "cachedEmbeddingsCount": 18,
  "isLocal": true
}
```

### `POST /embed`
Generates normalized embeddings for arbitrary texts or chunks:
- **Request Body**: `{ "texts": ["..."] }` or `{ "chunks": [...] }`
- **Response**:
```json
{
  "embeddings": [[0.0412, -0.0183, ...]],
  "model": "all-MiniLM-L6-v2",
  "dimension": 384,
  "latencyMs": 8.4,
  "cachedCount": 12,
  "computedCount": 2
}
```

### `POST /search`
Executes vector retrieval across candidate chunks:
- **Request Body**:
```json
{
  "query": "FastAPI companion service architecture",
  "chunks": [...],
  "topK": 5,
  "strategy": null
}
```
- **Response**:
```json
{
  "query": "FastAPI companion service architecture",
  "results": [
    {
      "chunkId": "chunk-arch",
      "score": 0.8842,
      "rank": 1,
      "strategy": "heading_aware",
      "headingPath": ["WebRAG", "Architecture"],
      "excerpt": "The architecture consists of a Chrome MV3 extension side panel and a local FastAPI companion service.",
      "sourceBlockIds": ["block-1"]
    }
  ],
  "latencyMs": 11.2,
  "model": "all-MiniLM-L6-v2",
  "dimension": 384,
  "totalCandidates": 18
}
```

---

## 4. Side Panel User Experience

The Chrome extension side panel now features a dedicated **Retrieve** tab:

1. **Model Status Bar**:
   - Displays real-time status (`all-MiniLM-L6-v2 (384d)`), active device, and `🔒 Local & Private` badge.
   - Includes a "Check Status" button for live health probes.

2. **Search Input & Filters**:
   - Fast search bar with keyboard submission (`Enter`) and quick-clear action (`✕`).
   - Strategy filter buttons: `All`, `Recursive`, and `Heading-Aware` with live chunk counts.
   - Suggested test queries automatically parsed from captured heading hierarchy.

3. **Top-5 Result Cards**:
   - **Rank Badge**: `#1` to `#5` with gold/blue highlight for rank #1.
   - **Similarity Score Meter**: Visual percentage bar and 3-decimal score (`0.884 (88%)`), color-coded by quality (Green $\ge 75\%$, Blue $\ge 50\%$, Amber $< 50\%$).
   - **Strategy Pill**: Badges distinguishing `Recursive` vs `Heading-Aware` chunks.
   - **Heading Hierarchy Breadcrumbs**: Clickable document navigation path (`📂 WebRAG › Architecture`).
   - **Source Block Traceability**: Clickable `#block-id` tags that immediately navigate to and highlight the corresponding source block in the Block Tree.
   - **Compare Shortcut**: "Compare Chunk ↗" button to inspect chunk boundaries and overlap details.

---

## 5. Verification & Test Suite

### Automated Quality Gate Command
```bash
bash scripts/check-all.sh
```

### Test Coverage Summary:
- **Backend (`service/tests/test_day_5_retrieval.py`)**:
  - `test_model_status_endpoint`: Validates model status, dimensions (384), and local flags.
  - `test_embed_texts_and_normalization`: Validates unit L2 norm ($||\vec{v}||_2 \approx 1.0$).
  - `test_embed_cache_hits`: Verifies repeated content hashes reuse cached embeddings without re-encoding.
  - `test_search_retrieves_top_5_results_with_provenance`: Verifies known queries retrieve expected blocks at rank #1 with scores $> 0.4$.
  - `test_search_deterministic_tie_breaking`: Verifies identical ranking order across 5 successive identical runs.
  - `test_search_strategy_filter`: Verifies filtering by chunking strategy.
  - `test_search_validation_errors`: Validates structured 4xx error formatting on invalid inputs.
- **Frontend (`extension/src/sidepanel/__tests__/retrieval.test.tsx`)**:
  - `SearchResultCard`: Tests rank, score meter, strategy pill, heading path, excerpt, and inspection callbacks.
  - `RetrievalView`: Tests query submission, mock service integration, results rendering, and offline error banner handling.
