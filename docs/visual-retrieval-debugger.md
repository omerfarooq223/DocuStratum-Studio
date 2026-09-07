# Visual Retrieval Debugger & Provenance Traceability

## 1. File structure and purpose

```text
WebRAG/
├── packages/schema/
│   ├── index.ts                                   # TestQuestion, RetrievalEvaluationResult, HighlightTarget, HighlightResponse
│   └── evaluation.json                            # JSON Schema for serialized evaluation runs, metrics, and ground truth
├── service/
│   ├── models.py                                  # Pydantic models for RetrievalQueryRequest, DraftQuestionsRequest/Response
│   ├── retrieval.py                               # Scoring, ranking, strategy selection, execution latency timing
│   ├── question_generator.py                      # Grounded synthetic evaluation question generator for candidate source blocks
│   ├── main.py                                    # Endpoints: POST /retrieval/query, POST /evaluation/draft-questions
│   └── tests/test_retrieval_service.py            # Backend test suite for retrieval query ranking and question generation
├── fixtures/
│   └── eval-questions.json                        # Curated benchmark questions comparing chunking strategies on demo fixture
├── extension/
│   ├── src/
│   │   ├── content/
│   │   │   ├── highlighter.ts                     # Live DOM highlighter with CSS selector + text quote resolution and stale fallback
│   │   │   ├── index.ts                           # Content script message router for HIGHLIGHT_SOURCE_BLOCK and CLEAR_HIGHLIGHTS
│   │   │   └── __tests__/highlighter.test.ts      # Vitest DOM unit tests for selector match, textQuote match, stale detection, toast cleanup
│   │   └── sidepanel/
│   │       ├── App.tsx                            # Debugger tab navigation, active draft state, chunk sync
│   │       ├── styles.css                         # Dark-mode styling for debugger panels, score pills, metric boxes, stale alerts
│   │       ├── utils/
│   │       │   ├── evaluationMetrics.ts           # Hit@k, MRR, aggregate benchmark calculations, local latency tracker
│   │       │   └── retrievalClient.ts             # Service client for retrieval query and question drafting
│   │       ├── components/
│   │       │   ├── RetrievalDebugger.tsx          # Main debugger view orchestrating query execution, metrics header, and question manager
│   │       │   ├── RetrievalResultCard.tsx        # Result card with score meter, rank badge, GT match indicator, and highlight action
│   │       │   ├── EvaluationMetricsPanel.tsx     # Hit@1, Hit@3, Hit@5, MRR, measured latency, and aggregate historical stats
│   │       │   ├── TestQuestionManager.tsx        # Question management: manual creation, LLM block auto-drafting, draft review queue
│   │       │   ├── StaleSourceWarning.tsx         # Warning alert when live DOM content diverged from capture
│   │       │   └── SavedBlockPreviewModal.tsx     # Fallback modal displaying captured snapshot when live DOM is inaccessible
│   │       └── __tests__/
│   │           ├── retrieval-debugger.test.tsx    # Vitest component tests for query run, GT badge, curated questions, draft review
│   │           └── evaluation-metrics.test.ts     # Unit tests for Hit@1, Hit@3, Hit@5, MRR, and aggregate metrics formulas
│   └── package.json                               # Focused test & build scripts
└── docs/visual-retrieval-debugger.md              # This technical specification, mathematics, and verification runbook
```

---

## 2. Architecture & Design Rationale

### The Visual Retrieval Debugging Loop
Traditional RAG evaluation is opaque: an evaluation script outputs a scalar score (e.g., Hit@5 = 0.8), leaving developers guessing *why* a passage failed to retrieve or *which* exact sentence caused the similarity match.

WebRAG Studio's Visual Retrieval Debugger bridges the gap between mathematical vector scoring and physical webpage DOM elements:

```text
User Query / Test Question
       │
       ▼
Local Vector Retrieval (POST /retrieval/query)
       │
       ▼
Ranked Chunk Results + Similarity Scores
       │
       ├──► 1. Ground Truth Matching: compares retrieved sourceBlockIds against expectedBlockId
       ├──► 2. Metric Computation: calculates Hit@1, Hit@3, Hit@5, and Reciprocal Rank
       └──► 3. Visual Trace: user clicks "Highlight Source" on any result card
                   │
                   ▼
       Chrome Tab Messaging (HIGHLIGHT_SOURCE_BLOCK)
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
   [Live DOM Match]    [DOM Content Stale / Changed]
   - Smooth scroll     - Stale alert displayed
   - Pulse outline     - Saved Block Preview Modal opened
   - Visual toast
```

---

### Two-Phase Resilient Live DOM Highlighting

When the user triggers "Highlight Source", `extension/src/content/highlighter.ts` executes a robust two-phase resolution algorithm to locate the passage in the active tab:

1. **Phase 1: CSS Selector Match with Content Verification**
   - Attempts `document.querySelector(target.cssSelector)`.
   - If found, normalizes whitespace and verifies that the live text contains the first 20 characters of `target.textQuote.exact`.
   - If content matches: scrolls smoothly to center, injects high-contrast pulse styling, and displays a temporary notification toast.

2. **Phase 2: TreeWalker Text Quote Fallback**
   - If the CSS selector is missing, changed, or invalid, a `TreeWalker` traverses all text-bearing DOM elements searching for `target.textQuote.exact`.
   - If found in a relocated node: highlights the element with a `textQuote (relocated)` badge.

3. **Phase 3: Stale DOM Fallback**
   - If the selector points to mutated text or the element no longer exists on the page, the content script returns `{ ok: false, status: "stale", reason: "..." }`.
   - The extension side panel never crashes. Instead, it renders an inline **`StaleSourceWarning`** banner with a **"View Captured Preview"** button.
   - Clicking opens **`SavedBlockPreviewModal`**, rendering the exact captured block text, heading path, CSS selector, and SHA-256 content hash recorded at capture time.

---

### Evaluation Metrics Mathematical Foundation

#### 1. Hit@k Metric
Given a query $q$ with expected ground-truth block $b^*$, and top-$k$ retrieved chunks $C_k = [c_1, c_2, \dots, c_k]$:

$$\text{Hit@}k(q, b^*) = \begin{cases} 1 & \text{if } \exists \, c_i \in C_k \text{ such that } b^* \in c_i.\text{sourceBlockIds} \\ 0 & \text{otherwise} \end{cases}$$

For an evaluation set of $N$ ground-truth queries, the aggregate Hit@k rate is:

$$\text{Hit@}k\text{ Rate} = \frac{1}{N} \sum_{j=1}^N \text{Hit@}k(q_j, b_j^*)$$

#### 2. Mean Reciprocal Rank (MRR)
For a query $q$ with ground-truth target $b^*$, let $\text{rank}(q, b^*)$ be the 1-based index of the first retrieved chunk containing $b^*$:

$$\text{RR}(q, b^*) = \begin{cases} \frac{1}{\text{rank}(q, b^*)} & \text{if } b^* \text{ is retrieved in results} \\ 0.0 & \text{otherwise} \end{cases}$$

The Mean Reciprocal Rank over $N$ queries is:

$$\text{MRR} = \frac{1}{N} \sum_{j=1}^N \text{RR}(q_j, b_j^*)$$

#### 3. Honest Latency Measurement
Latency is measured via `performance.now()` in browser memory, reflecting actual end-to-end user-perceived retrieval latency without fabricated benchmarks.

---

### Human-in-the-Loop LLM Test-Question Generation

To accelerate building comprehensive evaluation sets without sacrificing ground-truth integrity:
- Users select candidate source blocks from the captured document.
- The companion service (`/evaluation/draft-questions`) drafts synthetic questions anchored directly to the selected blocks.
- **Critical Safety Gate**: Every generated question enters an **"LLM Draft Review Queue"** with `status: "draft"`.
- Drafts are **never silently treated as ground truth**. The user must review, optionally edit the prompt text, and explicitly click **"Accept into Eval Set"** to promote the question to `status: "curated"`.

---

## 3. API Contract & Endpoints

### `POST /retrieval/query`
Executes vector retrieval over the supplied candidate chunks and returns scored, ranked results:

**Request Body (`RetrievalQueryRequest`):**
```json
{
  "query": "What are the token limits for heading-aware chunking?",
  "strategy": "heading_aware",
  "topK": 5,
  "chunks": [
    {
      "id": "chk_01928374",
      "sourceNamespace": "cap_84920",
      "strategy": "heading_aware",
      "sequence": 0,
      "content": "## Token Limits\nHeading-aware chunks fit up to 700 characters...",
      "sourceBlockIds": ["blk_002"],
      "sourceSpans": [{"blockId": "blk_002", "startOffset": 0, "endOffset": 62, "overlapCharacters": 0}],
      "headingPath": ["Authentication", "Token Limits"],
      "tokenCount": 14,
      "characterCount": 62,
      "contentHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ]
}
```

**Response Body (`RetrievalQueryResponse`):**
```json
{
  "results": [
    {
      "chunkId": "chk_01928374",
      "score": 0.8924,
      "rank": 1,
      "strategy": "heading_aware",
      "headingPath": ["Authentication", "Token Limits"],
      "excerpt": "Heading-aware chunks fit up to 700 characters...",
      "sourceBlockIds": ["blk_002"]
    }
  ],
  "executionTimeMs": 8.45
}
```

---

### `POST /evaluation/draft-questions`
Generates candidate evaluation question drafts linked to source block IDs:

**Request Body (`DraftQuestionsRequest`):**
```json
{
  "blocks": [
    {
      "id": "blk_002",
      "type": "paragraph",
      "content": "To acquire an access token, send a POST request to /oauth/token.",
      "headingPath": ["Authentication", "Token Generation"],
      "sourceAnchor": {
        "blockId": "blk_002",
        "headingPath": ["Authentication", "Token Generation"],
        "cssSelector": "p#token-gen",
        "textQuote": { "exact": "To acquire an access token" }
      },
      "contentHash": "a1b2c3d4",
      "included": true
    }
  ]
}
```

**Response Body (`DraftQuestionsResponse`):**
```json
{
  "questions": [
    {
      "id": "draft_4f9a12c8",
      "query": "Where does the passage mention 'To acquire an access token'?",
      "expectedBlockId": "blk_002",
      "generatedFromBlockId": "blk_002",
      "notes": "Auto-generated draft from block blk_002 (paragraph)",
      "status": "draft",
      "createdAt": "2026-08-18T00:00:00.000Z",
      "updatedAt": "2026-08-18T00:00:00.000Z"
    }
  ]
}
```

---

## 4. Side Panel User Experience

The Chrome extension side panel features a dedicated **🎯 Debugger** tab:

1. **Metrics Dashboard Header**:
   - **Local Measured Latency**: Real-time probe in milliseconds (`12 ms`).
   - **Current Run Cards**: `Hit@1`, `Hit@3`, `Hit@5`, and `MRR` with color-coded badges (Green `1`, Rose `0`, Slate `N/A` for unsupervised runs).
   - **Aggregate Benchmark Summary**: Automatically displayed after multiple runs, showing Hit@5 Rate, Mean Reciprocal Rank, and average latency across ground-truth queries.

2. **Query & Configuration Bar**:
   - Keyboard-responsive query input with `Enter` submission.
   - **Chunker Selector**: Instantly switch between `Recursive Chunks` and `Heading-Aware Chunks`.
   - **Top-K Selector**: Choose between Top 3, Top 5, and Top 10 candidate ranks.
   - **Expected Block Dropdown**: Select ground-truth block from captured document or leave as `(None)`.

3. **Retrieved Result Cards**:
   - **Rank & Cosine Score Meter**: Displays percentage score and ranking (`#1`, `89.2%`).
   - **Ground Truth Match Banner**: Automatically highlights with an emerald badge when a retrieved chunk satisfies the selected expected block.
   - **Strategy Pill & Heading Breadcrumb**: Preserves structural hierarchy provenance (`Authentication > Token Generation`).
   - **Highlight Source Action**: One-click trigger that scrolls the live webpage and activates high-contrast visual highlighting.
   - **Stale Anchor Warning**: Inline alert when live DOM content diverged from snapshot, offering an instant modal preview of the saved captured block.

4. **Test Question Manager**:
   - **Curated Set**: Pre-loaded with fixture benchmark questions; one-click **"Run"** button populates query, sets expected block, and executes retrieval.
   - **Manual Creation Modal**: Fast form to register new custom questions with ground-truth blocks and notes.
   - **LLM Block Auto-Drafter**: Checkbox selector over captured blocks with a single **"Generate from (N) blocks"** button.
   - **Draft Review Queue**: Prompts appear with amber border for interactive editing, discarding, or accepting into the curated evaluation benchmark.

---

## 5. Verification & Test Suite

### Automated Quality Gate Command
```bash
npm test
```

### Test Coverage Summary:
- **Content Script Highlighter (`extension/src/content/__tests__/highlighter.test.ts`)**:
  - `highlights element matched via exact CSS selector and adds toast`: Verifies primary selector resolution, CSS class injection, and visual toast.
  - `falls back to textQuote matching when CSS selector has changed or is invalid`: Verifies TreeWalker DOM text traversal fallback.
  - `returns stale status when live content has diverged from captured text`: Verifies content verification against live DOM modifications.
  - `returns stale status when element cannot be found in DOM`: Verifies graceful failure on missing nodes without throwing errors.
  - `auto-cleans highlight and toast after timeout or manual cleanup`: Verifies timer cleanup after 4 seconds.

- **Evaluation Metrics Engine (`extension/src/sidepanel/__tests__/evaluation-metrics.test.ts`)**:
  - `computes Hit@1, Hit@3, Hit@5 and MRR when target is at rank 1`: Validates rank 1 math ($\text{Hit@1}=1, \text{MRR}=1.0$).
  - `computes Hit@3 and MRR = 0.3333 when target is at rank 3`: Validates rank 3 math ($\text{Hit@1}=0, \text{Hit@3}=1, \text{MRR}=0.3333$).
  - `computes MRR = 0.0 and all false hits when target is missing`: Validates zero hits.
  - `leaves metrics undefined for unsupervised queries`: Verifies unsupervised queries without ground truth leave metrics undefined.
  - `calculates aggregate metrics across multiple runs correctly`: Validates multi-run aggregation ($\text{Hit@5 Rate}$, $\text{MRR}$, average latency).

- **Side Panel Retrieval Debugger Component (`extension/src/sidepanel/__tests__/retrieval-debugger.test.tsx`)**:
  - `renders retrieval controls, metrics header, and curated questions`: Tests complete initial UI mounting.
  - `allows switching chunking strategies between recursive and heading_aware`: Tests strategy dropdown re-binding.
  - `executes a query against mocked backend and renders retrieval results and ground truth badge`: Tests end-to-end query flow, score meter, source ID, and emerald GT match badge.
  - `runs evaluation when clicking Run on a curated test question`: Tests one-click benchmark execution from the curated question list.
  - `allows auto-drafting questions from blocks and accepting them into curated set`: Tests full human-in-the-loop review queue flow from block selection to accepted curated question.

- **Backend Retrieval Service (`service/tests/test_retrieval_service.py`)**:
  - `test_retrieval_query_endpoint`: Tests `/retrieval/query` scoring, top-K ranking, provenance mapping, and latency timing.
  - `test_draft_questions_endpoint`: Tests `/evaluation/draft-questions` synthetic prompt generation with source block binding and `draft` status assignment.

---

## 6. Acceptance Gate Checklist

| Acceptance Requirement | Implementation & Proof | Status |
|---|---|---|
| Every fixture retrieval result resolves to a live or saved highlight | Content script `highlightTargetInDom` with CSS selector & TreeWalker textQuote resolution | ✅ PASSED |
| Changed/missing elements never crash navigation and are visibly marked stale | Content divergence check in `highlighter.ts` + `StaleSourceWarning` + `SavedBlockPreviewModal` | ✅ PASSED |
| At least three curated questions compare both chunkers and persist their results | Pre-loaded curated questions in `RetrievalDebugger.tsx` and `fixtures/eval-questions.json` | ✅ PASSED |
| Generated questions are editable, retain source block IDs, and require user review | `TestQuestionManager.tsx` LLM Draft Review Queue with status `draft` and required acceptance | ✅ PASSED |
| Latency is reported honestly as local measured time | End-to-end timing via `performance.now()` in `evaluationMetrics.ts` and `RetrievalDebugger.tsx` | ✅ PASSED |
| Full monorepo quality gate passes | Automated test script passes all Python service tests, extension tests, and Vite build | ✅ PASSED |
