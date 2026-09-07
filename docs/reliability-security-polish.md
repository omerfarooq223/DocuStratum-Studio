# Reliability, Security, and Production Hardening

## Delivered outcome

The golden path now has a repeatable integration smoke test, explicit local-service resource limits, privacy-safe structured request logs, restricted CORS, adversarial capture coverage, resilient draft restoration, and a least-privilege content-script lifecycle.

## Reliability and failure matrix

| Failure or boundary | Expected behavior | Automated evidence |
|---|---|---|
| Service offline | Header shows `OFFLINE`; clicking it retries health checks | Existing side-panel health tests |
| Malformed JSON contract | Structured `VALIDATION_ERROR` with request ID | `test_hardening.py` |
| Request over 5 MB | HTTP 413 with a page/chunk reduction instruction | `test_hardening.py` |
| More than 1,000 blocks or 2,000 chunks | Request rejected before processing | Pydantic contract limits |
| More than 50 LLM context chunks | Request rejected before provider use | `test_hardening.py` |
| Oversized block/chunk/text | Friendly validation response; no model work starts | `test_hardening.py` |
| Corrupt persisted draft | Draft is ignored and the empty state is shown | Storage validation and tests |
| Draft storage failure | Capture remains usable; no unhandled rejection | Storage utility behavior |
| Provider stream failure | Evidence remains visible and a retryable generic error is streamed | LLM tests and guarded stream |
| Invalid citation | Unsupported chunk ID is removed before rendering | Citation validation tests |
| Export validation failure | Capture remains available and an actionable error is returned | Export validation tests |
| Changed live DOM | Saved-source preview and stale warning remain available | Retrieval debugger tests |
| Extension reload | Last structurally valid capture is restored | Golden-path smoke test |

## Security changes

- The service accepts only loopback development origins and syntactically valid Chrome extension origins. Wildcard CORS and credentialed cross-origin requests are disabled.
- The extension no longer injects a content script into every matching page at load time. It uses `activeTab` and `scripting` only after the user explicitly starts a capture.
- Request bodies are capped at 5 MB. Contract-level caps cover block, chunk, text, evaluation, heading-depth, and LLM-context counts.
- Unexpected server errors never echo exception text, page text, prompts, credentials, or provider responses.
- Provider logs and errors classify network/HTTP failures without recording upstream response bodies, prompts, or exception payloads.
- JSON event logs contain timestamp, request ID, method, path, status, duration, and error classification only. Page content is not logged.
- Responses include `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, and a validated or generated request ID.
- The adversarial fixture combines scripts, event handlers, editable content, iframes, hidden text, form secrets, and prompt injection. Executable/secret-bearing content is excluded; prompt-injection prose remains inert evidence.

## Automated smoke test

Run:

```bash
npm run smoke
```

Each run restores a saved capture and visits block review, deterministic chunk comparison, local retrieval, and portable export. The script requires three consecutive passes.

## Manual browser checklist

1. Start the service and load `extension/dist` as an unpacked extension.
2. Open `fixtures/demo-fixture.html`, open WebRAG Studio, and confirm `HEALTHY`.
3. Capture the full page. Confirm the login form and its values are absent.
4. Exclude one block, inspect Markdown, compare both chunkers, and run the query “How long is a token valid?”
5. Open the top result and confirm its source highlight.
6. If Groq is configured, generate an answer and open every citation. If it is disabled, confirm retrieval and export still work.
7. Export the ZIP, validate it, reload the panel, and confirm the draft is restored.
8. Repeat with `fixtures/malicious-fixture.html`; confirm no secret marker appears and no script/event executes.

## Benchmark protocol

Report retrieval and LLM timings separately. For retrieval, record hardware, operating system, Python version, embedding model, device, fixture character/block/chunk counts, cold model-load time, warm query latency, sample count, median, and p95. For LLM calls, record provider/model and network conditions; do not merge them into local retrieval latency.

No fabricated performance number is committed. The retrieval UI records measured per-query latency, and exported evaluation results preserve it as `measuredLatencyMs`. A release benchmark should use at least 20 warm queries after one discarded warm-up.

Run the reproducible five-chunk, twenty-query benchmark with:

```bash
npm run benchmark:retrieval
```

The command prints machine, operating system, Python, model, device, cold start, warm median, warm p95, fixture size, and sample count as JSON. Cold start includes model initialization and must never be combined with warm retrieval latency.

### Recorded Verification Evidence — 2026-08-20

| Field | Result |
|---|---:|
| Hardware / OS | Apple arm64 / macOS 26.5.2 |
| Python / device | 3.14.3 / CPU |
| Model | `all-MiniLM-L6-v2` |
| Fixture | 5 chunks |
| Warm uncached queries | 20 |
| Cold start, including model initialization | 4,166.20 ms |
| Warm median | 4.57 ms |
| Warm p95 | 6.52 ms |

This is portfolio evidence for the small fixed fixture, not a general throughput claim. LLM/network latency was intentionally excluded.

## Deliberate limitations

- Single-page captures only; no crawling, authenticated-page automation, PDFs, OCR, shadow DOM, or canvas extraction.
- English text and simple HTML tables are the supported content envelope.
- The local embedding model may require an initial download; the service cannot claim offline readiness until the model is cached.
- In-memory retrieval is intentionally scoped to the captured page, not a production multi-tenant corpus.
- Groq latency and availability are network-dependent. All non-generative features remain local and usable without it.
