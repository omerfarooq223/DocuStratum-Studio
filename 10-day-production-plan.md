# WebRAG Studio - 10-Day Production-Minded MVP Plan

## 1. Delivery target

Build a reliable, portfolio-ready local MVP that demonstrates this complete workflow:

1. Open a public documentation page.
2. Capture selected text, a chosen element, or the cleaned main page from a Chrome side panel.
3. Inspect and edit a structure-preserving block tree.
4. Compare recursive and heading-aware chunks.
5. Run local retrieval tests and inspect the top five results.
6. Click a result to highlight its exact source passage.
7. Export a reproducible ZIP package and load it with a small Python example.

The project is production-minded, but intentionally not production-scale. It should communicate disciplined engineering through predictable behavior, validation, useful errors, privacy-aware defaults, tests, documentation, and a repeatable demo.

## 2. Constraints and assumptions

- One developer, 10 focused working days, approximately 6-8 hours per day.
- Runs entirely on the developer's machine.
- No paid plan, hosted database, OAuth application, or billing setup is required.
- A user-supplied Groq API key is available for LLM features. The integration must also accept any OpenAI-compatible endpoint through the same provider interface.
- Retrieval and export remain fully functional without an LLM. A local, open-source embedding model is the deterministic retrieval foundation; Groq adds grounded answers, test-question generation, and explanations.
- Internet is needed for Groq-powered features and initially to install open-source dependencies and download the embedding model. The prepared retrieval/debugging demo still works locally if the API is unavailable.
- Chrome Developer Mode is used to load the unpacked extension. Runtime permissions are limited to the active tab, scripting, side panel, and local storage.
- Demo pages are ordinary public HTML documentation pages plus a local fixture page for guaranteed repeatability.
- The MVP supports English text and simple HTML tables. Complex canvases, PDFs, shadow DOM, authenticated pages, and multi-page crawling are explicitly deferred.

## 3. Scope contract

### Must ship (P0)

- Manifest V3 Chrome extension with a side panel.
- Capture modes: selection, element, and cleaned page.
- Semantic block types: heading, paragraph, list, code, table, and callout/quote.
- Block review: include/exclude blocks and preview cleaned Markdown.
- Provenance: source URL, title, capture time, heading path, selector/anchor, block ID, and content hash.
- Two deterministic chunkers: recursive and heading-aware.
- Local companion service for chunking, embeddings, retrieval, evaluation, and export.
- Local embedding model with model name and dimension recorded in the manifest.
- Retrieval test view with query input, top five results, similarity score, heading path, and source highlight.
- Provider-agnostic LLM gateway with Groq as the first configured provider, server-side key handling, streaming, timeout, retry, and rate-limit-aware errors.
- Grounded answer view that uses only retrieved chunks, attaches resolvable citations, and states when the supplied context is insufficient.
- Generate a small editable evaluation set from captured content using the LLM, while retaining manual question entry.
- Portable ZIP containing manifest, cleaned Markdown, blocks JSONL, chunks JSONL, evaluation JSONL, and README.
- Plain Python loader demonstrating package import.
- Automated unit/integration tests, three extraction fixtures, setup guide, troubleshooting guide, and a rehearsed 60-second demo.

### Ship only if P0 is stable (P1)

- IndexedDB persistence for the latest capture and evaluation session.
- CSV export of chunks.
- Hit@k and mean reciprocal rank when the user marks an expected block.
- Local Chroma import/search example using package text and metadata, without making Chroma part of the required runtime.
- Optional Ollama/OpenAI-compatible local-provider configuration if the developer already has a suitable model installed.
- LLM-assisted qualitative notes that explain likely retrieval failures after deterministic metrics are calculated.

### Explicitly deferred (P2)

- Cloud sync, accounts, collaboration, telemetry, or hosted deployment.
- Multi-page crawling, sitemap ingestion, scheduled recapture, and live monitoring.
- Semantic, parent-child, and element-aware chunking beyond the two P0 strategies.
- Incremental re-embedding and full version-diff UI.
- Qdrant, pgvector, Pinecone, Weaviate, LlamaIndex, Haystack, and MCP integrations.
- OCR, PDF ingestion, screenshots, image understanding, and JavaScript-heavy site automation.
- Autonomous browsing/decision-making agents. A grounded single-page RAG answer flow is included, but open-ended agent orchestration is not a ten-day feature.

## 4. Architecture that fits the deadline

```text
Web page
  -> content script: selection/element/page capture and source anchors
  -> side panel: review blocks, compare chunks, run test queries
  -> MV3 service worker: small message router and health checks only
  -> local FastAPI service: normalize, chunk, embed, search, evaluate, answer, export
       -> optional Groq/OpenAI-compatible LLM provider
  -> local files/cache: model cache and generated ZIP packages
```

Recommended implementation choices:

- Extension: TypeScript, React, Vite, Chrome Manifest V3.
- Local service: Python, FastAPI, Pydantic, Uvicorn.
- Extraction: deterministic DOM traversal plus a main-content heuristic; no AI extraction.
- Token sizing: a local tokenizer when available, with a deterministic word-count fallback.
- Embeddings: a small open-source sentence embedding model executed locally. Pin the model identifier and package versions.
- Similarity search: in-memory cosine similarity using NumPy for the MVP. This avoids operating a database while retaining correct retrieval logic for a single-page demo.
- LLM: a narrow `LLMProvider` interface with Groq as the initial adapter. Prompts are versioned, retrieved context is delimited as untrusted data, responses use structured citation IDs, and the API key exists only in the local service environment.
- Optional integrations: local Chroma for a vector-store demonstration and any OpenAI-compatible endpoint for model substitution. Neither is required for the core application to start.
- Persistence: IndexedDB for UI drafts; generated artifacts on local disk. No server database is required.
- Contracts: shared JSON Schema fixtures generated from or validated against Pydantic models.

The extension service worker must not own long-running state because MV3 workers can stop when idle. Every request receives a job ID or a complete response, and the side panel can recover by checking service health and reloading persisted draft state.

## 5. Definition of done for the MVP

The MVP is done only when all of the following pass on a clean local setup:

- A fresh user can follow the README and start both components in 15 minutes or less.
- The local fixture demo works without internet after dependencies and the model are cached.
- All three capture modes complete or show a useful, recoverable error.
- Capturing a form never includes input values, password fields, scripts, styles, or hidden UI controls.
- Headings, paragraphs, lists, code blocks, and a simple table survive extraction on the fixture page.
- Both chunkers produce deterministic IDs and never emit an empty chunk.
- Every retrieved result resolves to a saved block and a highlightable source anchor.
- Every generated answer cites only chunk IDs supplied in its retrieval context; invalid citations are rejected before display.
- Turning off the LLM provider disables answer generation gracefully while capture, chunking, retrieval, evaluation, highlighting, and export continue working.
- An unavailable local service produces a clear status and retry action instead of a broken screen.
- Export validation rejects incomplete packages and a second process can load the final ZIP.
- Unit and integration tests pass; the golden-path browser smoke test passes three consecutive times.
- The retrieval/debugging demo can be completed in 60-90 seconds without editing code or relying on a live third-party service; the enhanced 2-minute demo adds a live Groq-grounded answer when connectivity is available.

## 6. Ten-day execution plan

### Day 1 - Lock the contract and build the walking skeleton

**Outcome:** The side panel talks to a healthy local service through a versioned contract.

Work:

- Create the monorepo structure: `extension/`, `service/`, `packages/schema/`, `fixtures/`, `docs/`, and `scripts/`.
- Write the P0 scope, architecture decision record, data-flow diagram, and threat checklist.
- Define `Capture`, `Block`, `Chunk`, `RetrievalResult`, `EvaluationRun`, and `Manifest` schemas.
- Scaffold the MV3 extension, side panel, content script, and service worker.
- Scaffold FastAPI with `/health`, `/version`, structured error responses, CORS restricted to the extension origin where practical, and request IDs.
- Add format, lint, type-check, and test commands for both TypeScript and Python.
- Create one local HTML documentation fixture containing headings, lists, code, a warning, and a table.

Acceptance gate:

- The unpacked extension opens its side panel.
- The panel shows service status and compatible schema/API versions.
- CI-equivalent local checks run with one command and pass.
- A failed health check renders a useful recovery message.

Do not spend time on visual polish beyond a clean layout and readable status states.

### Day 2 - Implement safe DOM capture and provenance

**Outcome:** All three capture modes return normalized, traceable blocks.

Work:

- Implement selection capture with a small amount of heading context.
- Implement an element picker with hover outline, click-to-capture, Escape-to-cancel, and cleanup on completion.
- Implement page capture using `main`, `article`, and content-density fallbacks.
- Convert DOM nodes into semantic blocks while preserving heading hierarchy, lists, code language hints, table headers/rows, and callouts.
- Exclude scripts, styles, navigation, repeated UI controls, hidden nodes, editable controls, form values, and password inputs.
- Generate resilient source anchors using block ID, heading path, text quote, and a CSS selector fallback.
- Record URL, canonical URL when available, title, capture time, capture mode, extractor version, and SHA-256 content hash.

Acceptance gate:

- Golden fixture tests cover all supported block types and excluded sensitive/control content.
- Repeating a capture on unchanged content produces the same normalized block content and IDs.
- Selection, element, and page capture each work on the fixture page and one public documentation page.

### Day 3 - Build the review and cleaned-content experience

**Outcome:** The user can see and correct extraction before any processing occurs.

Work:

- Render the ordered block tree with type, heading path, source preview, and include/exclude control.
- Add bulk include/exclude and restore-original actions.
- Generate a live cleaned Markdown preview.
- Add explicit empty, loading, success, invalid-page, restricted-page, and recoverable-error states.
- Persist the latest draft capture locally so closing and reopening the panel does not lose work.
- Add extraction summary counts: included blocks, excluded blocks, characters, and detected structures.

Acceptance gate:

- Removing a block immediately updates Markdown and downstream input.
- Refreshing the side panel restores the last valid draft.
- Unsupported/restricted pages fail safely without stale content from the previous capture.
- Keyboard focus, labels, contrast, and scroll behavior support a smooth demo.

### Day 4 - Implement deterministic chunking and comparison

**Outcome:** Two chunking strategies are visible, explainable, and reproducible.

Work:

- Implement recursive splitting with configurable maximum size and overlap.
- Implement heading-aware splitting that preserves heading paths and keeps structural elements intact when within limits.
- Define behavior for oversized code blocks and tables: split with explicit continuation metadata rather than silently truncating.
- Create stable chunk IDs from source namespace, strategy, heading path, source block IDs, sequence, and content hash.
- Add side-by-side strategy tabs or columns with chunk count, size distribution, overlaps, and block relationships.
- Add boundary tests for empty content, one oversized block, unicode, lists, tables, code, and exact-size inputs.

Acceptance gate:

- Same input plus same settings produces byte-equivalent chunks and IDs.
- No content is silently lost or duplicated except declared overlap.
- Clicking a chunk highlights all contributing blocks in the review panel.
- The user can explain the visible difference between recursive and heading-aware output in under 20 seconds.

### Day 5 - Add local embeddings and retrieval

**Outcome:** A query retrieves the top five chunks locally with transparent metadata.

Work:

- Integrate one small local sentence-embedding model and pin its exact identifier.
- Add model warm-up, model-cache detection, progress/status reporting, and a clear first-run message.
- Normalize vectors and implement cosine similarity with deterministic ordering for ties.
- Cache embeddings by model ID plus chunk content hash.
- Add `/embed` and `/search` endpoints with validation, request limits, timeouts, and structured failures.
- Display top five results with rank, score, strategy, heading path, and excerpt.

Acceptance gate:

- A known fixture query returns the expected block in the top five.
- Repeating a query returns the same ranking.
- No text is sent over the network during embedding or retrieval.
- Missing model files or an unavailable service produce actionable messages.

Fallback rule:

- If model integration consumes more than half a day, freeze the UI and service contract, use a smaller supported local model, and drop P1 persistence/metrics. Do not introduce a paid API.

### Day 6 - Complete the visual retrieval debugger

**Outcome:** Retrieval failures can be inspected from result to exact source passage.

Work:

- On result click, resolve the chunk's source block IDs and anchor data.
- Scroll the live page to the source and apply a temporary, accessible highlight.
- If the live DOM no longer matches, fall back to highlighting the saved block preview and show a stale-source warning.
- Add manual test questions with optional expected-block selection.
- Add LLM-generated test-question drafts from selected source blocks; require user review before they enter the evaluation set.
- Record query, configuration, ranks, scores, latency, expected block, and notes.
- Compute hit@k and mean reciprocal rank only when ground truth is supplied.

Acceptance gate:

- Every fixture retrieval result resolves to a live or saved highlight.
- Changed/missing elements never crash navigation and are visibly marked stale.
- At least three curated questions compare both chunkers and persist their results.
- Generated questions are editable, retain their expected source block IDs, and are never silently treated as ground truth.
- Latency is reported honestly as local measured time, not a fabricated benchmark.

### Day 7 - Add grounded LLM answers and provider resilience

**Outcome:** The same retrieval evidence can produce a useful answer with verifiable citations, without hiding the underlying chunks.

Work:

- Define an `LLMProvider` interface and implement Groq as the first adapter; keep model name, base URL, timeout, and feature flags configurable.
- Read `GROQ_API_KEY` only in the local FastAPI process. Never expose it to the extension bundle, browser storage, logs, exports, or error messages.
- Implement retrieval-augmented answer generation with a strict context budget, delimited untrusted webpage content, and structured output containing answer text, cited chunk IDs, and an insufficient-context flag.
- Stream answer events to the side panel with cancel, retry, timeout, rate-limit, authentication-error, and provider-offline states.
- Validate every returned citation against the chunks supplied to the model. Reject or visibly flag unsupported citation IDs rather than rendering false provenance.
- Add a prompt-injection fixture that asks the model to ignore system rules, reveal secrets, or call tools; verify the content remains inert evidence.
- Display the answer beside the retrieved evidence, with each citation opening the same exact source highlight used by the debugger.
- Add a provider-disabled mode so the complete non-generative workflow remains available.

Acceptance gate:

- Three fixture questions produce grounded answers whose citations resolve to retrieved chunks and source highlights.
- A question not answered by the captured page returns an explicit insufficient-evidence response rather than an invented answer.
- Provider timeout, invalid key, rate limit, malformed output, cancellation, and offline status are recoverable and do not discard retrieval results.
- Logs and exports contain no API key, authorization header, or complete prompt by default.
- With Groq disabled, capture through export still works and the UI clearly explains which optional actions are unavailable.

### Day 8 - Build and validate the portable RAG package

**Outcome:** The project produces a vendor-neutral artifact that another script can consume.

Work:

- Generate the package layout:
  - `manifest.json`
  - `source/cleaned.md`
  - `source/blocks.jsonl`
  - `chunks/chunks.jsonl`
  - `evaluation/questions.jsonl`
  - `evaluation/retrieval-results.jsonl`
  - `evaluation/answers.jsonl`
  - `README.md`
- Include format version, source identity, capture hash/time, extractor version, chunker settings, embedding metadata, optional generation metadata, prompt version, file checksums, and license/source-responsibility note.
- Validate every file before ZIP creation and reject exports with dangling block references.
- Write a dependency-light Python iterator/loader and one example similarity-search integration.
- Add an optional local Chroma import example if P0 export validation is complete by midday.
- Add a round-trip test: export, unzip, validate, load, and compare counts/hashes.

Acceptance gate:

- A clean Python process loads the ZIP and prints chunks with provenance.
- All manifest checksums match and all chunk-to-block relationships resolve.
- Answer citations, when exported, resolve to included chunks and record provider/model metadata without storing credentials.
- Re-exporting unchanged content/settings produces equivalent logical data; volatile timestamps may differ only where documented.
- Vectors are omitted from the portable source of truth; the manifest records how to regenerate them.

### Day 9 - Reliability, security, product polish, and portfolio evidence

**Outcome:** The golden path survives realistic failures and a reviewer can understand and run it without guidance.

Work:

- Finish integration tests across capture fixtures, service schemas, chunking, retrieval, highlighting, LLM answers, and export. Unit and contract tests are added continuously on Days 1-8, not postponed to this day.
- Add a browser smoke test for the local fixture golden path where automation is stable; retain a concise manual checklist as backup.
- Test service-offline, malformed payload, empty capture, oversized page, model-not-cached, changed DOM, provider timeout/rate limit, invalid citations, export failure, and extension reload cases.
- Add request-size and block-count limits with friendly explanations.
- Verify that captured webpage text is always handled as untrusted data and never executed as HTML, system instructions, or tool requests.
- Review extension permissions and remove anything not required by the P0 workflow.
- Add logs with timestamps, request IDs, event names, durations, and error codes; never log page contents by default.
- Refine hierarchy, spacing, labels, progress feedback, citations, provider-status states, keyboard focus, and result readability.
- Write README sections for value proposition, architecture, prerequisites, local and Groq configuration, privacy behavior, demo, tests, package format, limitations, and troubleshooting.
- Add architecture/data-flow diagrams, current screenshots, benchmark evidence, engineering tradeoffs, and a first-run checklist.

Acceptance gate:

- All automated checks pass from a clean checkout.
- The smoke test succeeds three consecutive times.
- A malicious fixture containing scripts, event handlers, prompt-injection text, and form secrets remains inert and excludes secrets.
- There are no unhandled promise rejections, uncaught backend exceptions, or unexplained console errors in the demo flow.
- A fresh-start rehearsal follows only the README.
- Every screenshot matches the current UI.
- Benchmarks separate local retrieval latency from network-dependent LLM latency and state hardware, fixture size, model, method, and sample count.
- Known limitations are visible and framed as deliberate boundaries, not hidden defects.

### Day 10 - Release candidate, rehearsal, and contingency buffer

**Outcome:** A tagged, reproducible release candidate is ready for demonstration.

Work:

- Freeze features at the start of the day.
- Run the full clean-install, test, package, and demo checklist.
- Test on the local fixture first and one public documentation page second.
- Fix only release-blocking defects: data loss, crash, broken setup, incorrect retrieval mapping, invalid export, or confusing demo-state failure.
- Produce a versioned extension build, service package/lockfile, sample export, and release notes.
- Rehearse the 60-90 second deterministic debugger demo and the 2-minute Groq-enhanced demo five times each; rehearse a 4-5 minute technical walkthrough twice.
- Capture a backup screen recording, pre-cache one valid answer for explanation only, and keep the local fixture plus retrieval flow as the no-network fallback. Clearly label cached output if it is shown.

Acceptance gate:

- The complete demo passes five consecutive rehearsals.
- The release artifacts can be rebuilt from the tagged source using documented commands.
- The sample ZIP passes schema, relationship, and checksum validation.
- A rollback point exists before any last-day fix.
- No P1/P2 feature is allowed to delay the release candidate.

## 7. Daily operating rhythm

Use the same rhythm each day:

- **First 15 minutes:** choose one measurable daily outcome and confirm the previous build still passes.
- **Main build block:** implement only work required for that day's acceptance gate.
- **Midday integration:** merge the complete vertical slice; do not leave extension and service work disconnected until evening.
- **Final 60-90 minutes:** test, fix the highest-risk defect, update the decision log, and record a 20-30 second proof clip or screenshot.
- **Stop rule:** if the acceptance gate is not met, move optional work out of scope before extending the day.

Track defects by release impact:

- **P0 blocker:** crash, data loss/leak, setup failure, wrong source mapping, invalid export, or demo cannot complete.
- **P1 important:** confusing state, weak accessibility, slow but usable path, or incomplete metric.
- **P2 polish:** cosmetic issue or optional enhancement.

## 8. Demo script

Use the local fixture for the guaranteed presentation and optionally repeat on a public API documentation page.

1. Open the fixture's Authentication section and the WebRAG Studio side panel.
2. Capture the section with Element mode.
3. Point out the preserved heading, warning, code sample, and table; exclude one irrelevant block.
4. Switch between recursive and heading-aware chunks and explain one visible boundary difference.
5. Run three prepared questions and compare the top results.
6. Click the best result to highlight the exact passage on the source page.
7. Generate a Groq-grounded answer, then click each answer citation to return to the exact source passage. Ask one deliberately unanswerable question to show the insufficient-evidence behavior.
8. Generate one candidate evaluation question from the selected source and show that it requires review before becoming ground truth.
9. Export the package, show its manifest and JSONL contents, and run the Python loader.
10. Close with the claim: the package can be re-embedded or re-answered with another compatible provider because text, structure, settings, hashes, provenance, and prompt/model metadata are the source of truth.

If Groq is unavailable, skip steps 7-8 and run the deterministic 60-90 second retrieval/debugger path. The product still demonstrates its primary differentiation.

## 9. Production-grade signals to emphasize in the presentation

- Least-privilege, user-initiated capture and local processing.
- Explicit data contracts and versioned portable format.
- Deterministic extraction/chunking and content-addressed caching.
- Source-to-result traceability with stale-anchor fallback.
- Provider abstraction, server-side secret handling, versioned prompts, untrusted-context isolation, and validated answer citations.
- Graceful degradation: provider failure disables generation, not ingestion, retrieval, evaluation, or export.
- Structured failure states and restart-safe draft persistence.
- Round-trip export validation instead of trusting a successful download.
- Reproducible fixtures, objective retrieval checks, and clean-install verification.
- Honest scope boundaries and an offline backup demo.

These details show a production mindset without pretending the ten-day MVP has cloud-scale infrastructure.

## 10. Scope-reduction ladder

If time slips, cut in this order while protecting the core story:

1. Drop CSV and Chroma examples.
2. Drop the optional Ollama/OpenAI-compatible configuration UI while keeping the provider interface and Groq adapter.
3. Drop IndexedDB history beyond the latest draft.
4. Keep only hit@k; remove mean reciprocal rank and LLM-authored qualitative notes.
5. Replace the automated browser test with a strict manual regression checklist, while retaining unit/integration tests.
6. Limit the polished demo to Element capture, but keep Selection and Page capture functional and plainly styled.

Never cut provenance, source highlighting, both chunkers, local retrieval, validated grounded citations, provider-failure handling, package validation, the Python loader, or the offline fixture. Those are the project's differentiators and proof of engineering quality.

## 11. Final artifact checklist

- Source repository with pinned dependencies and one-command quality checks.
- Unpacked extension release directory or build archive.
- Local service with documented start command and health check.
- `.env.example` and setup validation for Groq/provider configuration, with no real credential committed.
- Cached-model preparation instructions and offline-demo verification.
- Three HTML fixtures, including one malicious/sensitive-content fixture.
- Valid sample RAG package ZIP.
- Python loader example.
- Test and benchmark summary.
- README, architecture diagram, threat/permission notes, decision log, limitations, and troubleshooting.
- Versioned prompt templates, structured-output schemas, citation-validation tests, and provider failure fixtures.
- 60-90 second deterministic demo, 2-minute LLM-enhanced demo, backup recording, and 4-5 minute technical walkthrough outline.

## 12. Free-alternative expansion policy

The project is not artificially restricted to paid products. New capabilities are acceptable when they preserve the portable package and have a no-cost development path. The selection order is:

1. Browser-native or standard-library implementation.
2. Local open-source dependency.
3. Self-hosted open-source service.
4. User-supplied free-tier API behind a replaceable adapter.

Useful post-release adapters include local Ollama models, Chroma, Qdrant in local mode, FAISS, LlamaIndex, Haystack, LangChain, local rerankers, MCP resources, GitHub Actions for public-repository checks, and additional OpenAI-compatible inference providers. They should be added one vertical slice at a time with the same contracts, provenance, tests, and failure handling as the ten-day release.

Free availability alone is not a reason to put a feature into the ten-day critical path. Accounts, quotas, network latency, hardware requirements, and provider terms can still break a live demo. The architecture therefore permits these integrations without making any one of them mandatory.
