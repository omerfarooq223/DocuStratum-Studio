# Security Policy & Threat Model

WebRAG Studio is designed with a local-first, privacy-preserving architecture. The Chrome MV3 extension interacts with a companion FastAPI service running strictly on local loopback (`http://127.0.0.1:8000`).

---

## Threat Model

### 1. Local-Service Isolation & Extension Spoofing
- **Threat**: Untrusted local processes or malicious Chrome extensions installed in the same browser could attempt to call the companion service to invoke LLM endpoints using the user's configured provider API keys or exfiltrate captured document text.
- **Defenses**:
  - **Origin Isolation**: CORS is restricted to local loopback ports and valid Chrome extension schemes (`chrome-extension://`).
  - **Explicit Extension Allowlisting**: Administrators and users can set `WEBRAG_ALLOWED_EXTENSION_IDS=<extension-id>` to restrict CORS exclusively to their trusted WebRAG Studio extension installation.
  - **Bearer Token Authentication**: The service supports Bearer token authentication via `WEBRAG_AUTH_TOKEN` or a local session token file (`~/.webrag/auth_token` permissions `0600`). Sensitive operations (`/search`, `/embed`, `/retrieval/*`, `/llm/*`, `/export/*`, `/package/*`) reject unauthorized requests with HTTP 401.

### 2. Streaming Request Size & Memory Exhaustion (DoS)
- **Threat**: Adversarial clients could send oversized or endless chunked HTTP request streams without a `Content-Length` header to exhaust daemon memory.
- **Defenses**:
  - **Streaming Byte Enforcement**: An ASGI streaming interceptor wraps `request._receive` to count bytes received in real time. Any request exceeding `MAX_REQUEST_BYTES` (5 MB) is immediately aborted and rejected with HTTP 413 `REQUEST_TOO_LARGE`.

### 3. Decompression Bombs & Zip Slip
- **Threat**: Uploading malicious ZIP archives containing extreme compression ratios (zip bombs), thousands of nested entries, duplicate filenames, or directory traversal sequences (`../`) during package validation.
- **Defenses**:
  - **Structural Limits**: `MAX_ZIP_MEMBERS = 100`, `MAX_ZIP_SINGLE_FILE_BYTES = 10 MB`, `MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 20 MB`.
  - **Compression Ratio Cap**: Decompression ratio is bounded at `100:1` (`MAX_ZIP_COMPRESSION_RATIO`).
  - **Zip Slip Prevention**: All member filenames are inspected to reject absolute paths, leading slashes, and traversal segments.
  - **Safe Streaming Reader**: Actual decompression is monitored via a running byte counter that aborts early if forged headers disguise bomb payloads.
  - **Duplicate Entry Rejection**: Duplicate archive member entries are detected and rejected.

### 4. API Keys & Vector Data Isolation
- **Threat**: Accidental leakage of provider API keys (e.g. Groq, OpenAI) or dense embedding vectors in exported packages or logs.
- **Defenses**:
  - API keys reside solely in the local daemon's process environment and are never transmitted to the browser or stored in extension storage.
  - Exported packages strictly forbid `.npy`, `.bin`, or vector files (`FORBIDDEN_VECTOR_FILE`), preserving portability and preventing model weight/vector leakage.
  - Structured request logs record timestamps, HTTP methods, paths, and durations, but strictly sanitize and omit page content or query strings.

### 5. DOM Sanitization & Prompt Injection
- **Threat**: Malicious websites embedding hidden prompt injections, invisible text, or malicious scripts inside HTML pages targeted for capture.
- **Defenses**:
  - Scripts, iframes, styles, and hidden elements (`display: none`, `visibility: hidden`) are pruned prior to normalization.
  - Structural heading and list metadata are validated and bounded (`MAX_BLOCKS`, `MAX_BLOCK_CHARACTERS`, `MAX_HEADING_DEPTH`).
  - Grounded prompts demarcate retrieved evidence chunks in separate tagged boundaries to mitigate instruction override attempts.

---

## Vulnerability Reporting

If you discover a potential security vulnerability in WebRAG Studio:

1. **Do not** open a public GitHub issue.
2. Submit details through GitHub Private Vulnerability Reporting or email the maintainers directly.
3. Include detailed steps to reproduce the issue (proof-of-concept code, payloads, or fixtures).
4. Maintainers will acknowledge reports within **48 hours** and provide remediation updates until a fix is released.
