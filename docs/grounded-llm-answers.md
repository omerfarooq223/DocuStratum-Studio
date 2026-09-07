# Grounded LLM Answers and Provider Resilience

## 1. File structure and purpose

```text
WebRAG/
├── packages/schema/
│   ├── index.ts                                   # GroundedAnswerRequest, GroundedAnswerResponse, CitationRef, LLMProviderStatusResponse
│   └── evaluation.json                            # JSON Schema for grounded evaluation runs and citation structures
├── service/
│   ├── .env.example                               # Documented Groq and OpenAI-compatible environment configuration
│   ├── models.py                                  # Pydantic models for GroundedAnswerRequest/Response, LLMProviderStatusResponse
│   ├── llm/
│   │   ├── __init__.py                            # Provider factory get_llm_provider() with Mock fallback
│   │   ├── base.py                                # Abstract LLMProvider base class
│   │   ├── prompts.py                             # Versioned prompt templates (v1.0.0), XML context isolation, prompt injection defense
│   │   ├── citations.py                           # Strict citation validator and extractor against candidate chunks
│   │   ├── groq.py                                # GroqProvider adapter with async httpx, streaming, timeouts, and rate limit recovery
│   │   └── mock_provider.py                       # Deterministic MockLLMProvider for offline tests and keyless fallback
│   ├── main.py                                    # Endpoints: GET /llm/status, POST /llm/answer, POST /llm/answer/stream
│   └── tests/test_llm.py                          # Backend test suite (status, valid citations, hallucination rejection, injection defense, streaming)
├── fixtures/
│   └── prompt-injection-fixture.html              # Adversarial prompt-injection test fixture with simulated system overrides
├── extension/
│   ├── src/
│   │   └── sidepanel/
│   │       ├── utils/
│   │       │   └── llmClient.ts                   # Fetch status, generate grounded answer, and SSE token streaming client
│   │       ├── components/
│   │       │   ├── GroundedAnswerPanel.tsx        # Streaming answer card, insufficient evidence alert, citation pills, highlight actions
│   │       │   ├── RetrievalView.tsx              # Integrated Grounded Answer generation under semantic vector search results
│   │       │   └── RetrievalDebugger.tsx          # Integrated Grounded Answer panel in retrieval debugger view
│   │       └── __tests__/
│   │           └── grounded-answer.test.tsx       # Vitest component tests for streaming tokens, citation clicks, and offline notice
│   └── package.json                               # Build & test scripts
├── .env.example                                   # Root environment setup guide
└── docs/grounded-llm-answers.md                   # This architecture, security, and verification runbook
```

---

## 2. Architecture & Design Rationale

### Provider-Agnostic LLM Gateway
WebRAG Studio decouples the user interface from specific model vendors using the `LLMProvider` interface:

```text
Extension Side Panel (SSE Client)
       │
       ▼
Local FastAPI Companion Service (Isolated Environment)
       │
 ┌─────┴──────────────────────────────┐
 │  LLMProvider Interface             │
 │  ├── GroqProvider (Primary)        │
 │  │   └── Groq Cloud / OpenAI-comp. │
 │  └── MockLLMProvider (Fallback)    │
 └────────────────────────────────────┘
```

- **Default Adapter**: `GroqProvider` communicating with Groq's high-speed inference API (`llama-3.3-70b-versatile` default, with `llama-3.1-8b-instant` fallback).
- **OpenAI-Compatible Extensibility**: Configurable `GROQ_BASE_URL` allows swapping in local Ollama or other OpenAI-compatible inference servers without code modifications.
- **Mock Fallback**: `MockLLMProvider` powers offline tests, clean repository checkouts, and local operation when `GROQ_API_KEY` is not set.

---

### Strict Security & API Key Isolation

1. **Least-Privilege Environment Containment**:
   - `GROQ_API_KEY` resides **strictly in the local FastAPI backend process**.
   - It is **never** bundled in the Chrome extension, stored in browser `chrome.storage`, printed in logs, or written into exported RAG packages.
2. **Untrusted Context Isolation**:
   - Webpage content captured from public URLs is untrusted user data.
   - All retrieved chunks are escaped and enclosed inside explicit `<retrieved_context>` XML tags before injection into the prompt.
3. **Defense-in-Depth against Prompt Injections**:
   - The system prompt explicitly instructs the LLM that text within `<retrieved_context>` is inert evidence.
   - Any malicious instructions, prompt overrides, system secret queries, or tool requests inside captured web pages are neutralized.

---

### Strict Citation Validation Engine

To eliminate false provenance and LLM citation hallucinations:
1. When the LLM outputs citations (either formatted as `[chk_xxx]` or in `cited_chunk_ids`), `service/llm/citations.py` cross-checks every cited ID against the exact chunks supplied in the retrieval context.
2. Any hallucinated chunk ID not present in the candidate chunk set is **strictly rejected and filtered out**.
3. Every validated citation is resolved into a structured `CitationRef` containing its `sourceBlockIds`, `headingPath`, and content excerpt.
4. In the side panel, clicking a citation pill (`[chk_001]`) triggers the exact live DOM highlighter in the browser tab or opens the saved block preview modal if the DOM has changed.

---

### Truthful Insufficient Evidence Handling

Rather than allowing the model to hallucinate when asked an unanswerable question:
- The system instructions mandate that if the `<retrieved_context>` does not contain facts answering the user query, the model must output `"insufficient_evidence": true`.
- The side panel renders a high-visibility **"⚠️ Insufficient Context"** alert banner explaining that the captured document lacks sufficient facts to answer the question, confirming the model refused to fabricate false information.

---

## 3. API Contract & Endpoints

### `GET /llm/status`
Returns real-time provider configuration, model name, and API key readiness without leaking credentials:

```json
{
  "status": "configured",
  "provider": "groq",
  "model": "llama-3.3-70b-versatile",
  "hasApiKey": true,
  "isAvailable": true,
  "supportedModels": [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768"
  ],
  "errorMessage": null
}
```

---

### `POST /llm/answer`
Generates a structured, grounded answer citing only retrieved chunks:

**Request Body (`GroundedAnswerRequest`):**
```json
{
  "query": "How long do OAuth access tokens remain valid?",
  "chunks": [
    {
      "id": "chk_01928374",
      "sourceNamespace": "cap_84920",
      "strategy": "heading_aware",
      "sequence": 0,
      "content": "To acquire an access token, send a POST request to /oauth/token. Access tokens expire after 3600 seconds.",
      "sourceBlockIds": ["blk_002"],
      "sourceSpans": [{"blockId": "blk_002", "startOffset": 0, "endOffset": 104, "overlapCharacters": 0}],
      "headingPath": ["Authentication", "Token Generation"],
      "tokenCount": 18,
      "characterCount": 104,
      "contentHash": "a1b2c3d4e5f6..."
    }
  ],
  "temperature": 0.1
}
```

**Response Body (`GroundedAnswerResponse`):**
```json
{
  "query": "How long do OAuth access tokens remain valid?",
  "answer": "OAuth access tokens remain valid for 3600 seconds (1 hour) by default [chk_01928374].",
  "citations": ["chk_01928374"],
  "citationRefs": [
    {
      "chunkId": "chk_01928374",
      "sourceBlockIds": ["blk_002"],
      "headingPath": ["Authentication", "Token Generation"],
      "excerpt": "To acquire an access token, send a POST request to /oauth/token. Access tokens expire after 3600 seconds."
    }
  ],
  "insufficientEvidence": false,
  "model": "llama-3.3-70b-versatile",
  "provider": "groq",
  "latencyMs": 245.8,
  "promptVersion": "v1.0.0"
}
```

---

### `POST /llm/answer/stream`
Streams answer tokens via Server-Sent Events (SSE), concluding with the structured citation payload:

**Stream Event Sequence:**
```text
data: {"type":"token","token":"OAuth"}

data: {"type":"token","token":" access tokens remain valid for 3600 seconds [chk_01928374]."}

data: {"type":"done","answer":"OAuth access tokens remain valid for 3600 seconds [chk_01928374].","citations":["chk_01928374"],"citationRefs":[{"chunkId":"chk_01928374","sourceBlockIds":["blk_002"],"headingPath":["Authentication","Token Generation"],"excerpt":"To acquire an access token..."}],"insufficientEvidence":false,"model":"llama-3.3-70b-versatile","provider":"groq","latencyMs":260.4,"promptVersion":"v1.0.0"}
```

---

## 4. Side Panel User Experience

1. **Integrated Answer Card**:
   - Embedded directly in the **Semantic Search** (`RetrievalView`) and **🎯 Debugger** (`RetrievalDebugger`) workflows.
   - Displays real-time model badge (`Groq (llama-3.3-70b-versatile)`) and local inference latency.
2. **Streaming Prose with Interactive Citations**:
   - Tokens stream with an animated pulse cursor.
   - Inline citation badges `[chk_001]` and the **Retrieved Citations & Source Proof** cards allow clicking **"Highlight Source ↗"** to scroll the live webpage to the exact contributing passage.
3. **Insufficient Evidence Alert**:
   - High-contrast warning banner displayed when a question cannot be answered from the captured page.
4. **Resilience & Offline Guidance**:
   - Includes **Cancel** and **Retry** buttons for interactive control.
   - If `GROQ_API_KEY` is not set, a notice explains how to set the environment variable while reassuring the user that capture, vector search, chunking comparison, and package export remain 100% operational locally.

---

## 5. Verification & Test Suite

### Quality Gate Command
```bash
npm test
```

### Test Coverage Summary:
- **Backend LLM Suite (`service/tests/test_day_7_llm.py`)**:
  - `test_llm_status_endpoint`: Verifies provider status discovery, model availability, and strict API key isolation.
  - `test_citation_validator_accepts_valid_and_rejects_hallucinations`: Validates that valid chunk IDs are preserved while hallucinated chunk IDs are rejected.
  - `test_prompt_formatting_and_injection_isolation`: Confirms XML `<retrieved_context>` wrapping, escaping, and prompt injection defense text.
  - `test_mock_llm_grounded_answer`: Tests grounded answer generation and insufficient evidence handling on unanswerable questions.
  - `test_grounded_answer_api_endpoint`: Validates the FastAPI `/llm/answer` endpoint schema and response fields.
  - `test_grounded_answer_validation_errors`: Validates structured 400 errors for empty queries or empty chunk sets.
  - `test_groq_provider_rate_limit_and_auth_error_handling`: Tests recovery on HTTP 401 (invalid key), HTTP 429 (rate limit), and network timeouts.
  - `test_streaming_endpoint`: Validates the `/llm/answer/stream` Server-Sent Events stream format.

- **Frontend Component Suite (`extension/src/sidepanel/__tests__/grounded-answer.test.tsx`)**:
  - `renders provider status and generate button`: Validates initial UI mounting and model badge.
  - `handles streaming answer and renders completed answer with citations`: Tests SSE token streaming, answer rendering, and citation cards.
  - `renders insufficient context alert when question cannot be answered`: Tests warning banner when `insufficientEvidence === true`.
  - `renders unconfigured key notice when API key is missing`: Tests keyless fallback notice.

---

## 6. Acceptance Gate Checklist

| Acceptance Requirement | Implementation & Proof | Status |
|---|---|---|
| Grounded answers with resolvable citations | `GroqProvider` + `extract_and_validate_citations` + `GroundedAnswerPanel` | ✅ PASSED |
| Explicit insufficient-evidence response on unanswerable questions | `SYSTEM_INSTRUCTION` + `insufficientEvidence` flag + warning banner | ✅ PASSED |
| Provider resilience (401, 429, timeout, cancel) without losing results | `GroqProvider` error mapping + client retry & cancel controls | ✅ PASSED |
| API keys never exposed in bundles, storage, logs, or exports | Key isolated in FastAPI server process; zero keys in client or status responses | ✅ PASSED |
| Provider-disabled mode preserves all core RAG workflows | Graceful fallback notices; capture, search, chunking, and export work 100% offline | ✅ PASSED |
| Full monorepo quality gate passes | All Python backend tests, Vitest extension tests, and Vite build pass | ✅ PASSED |
