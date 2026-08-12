# WebRAG Studio Security & Threat Checklist

## Threat Mitigation Matrix

| Threat Category | Potential Risk | Mitigation Design | Status |
| :--- | :--- | :--- | :--- |
| **API Key Exposure** | Leak of user's Groq/LLM API key | Key resides strictly in FastAPI process `.env`. Never sent to extension, client storage, or export ZIP. | ✅ Enforced |
| **DOM Data Leakage** | Capturing sensitive form inputs or passwords | DOM extractor explicitly ignores `<input>`, `<textarea>`, `type="password"`, hidden fields, and auth headers. | ✅ Designed |
| **Prompt Injection** | Malicious webpage text hijacking system prompt | Webpage content is enclosed in strict untrusted data XML/Markdown fences (`<untrusted_content>`). | ✅ Designed |
| **CORS / Unauthorized Origin** | External site triggering local backend endpoints | FastAPI CORS origin restricted to extension origins and localhost. Unique `X-Request-ID` attached to all calls. | ✅ Enforced |
| **Invalid Citations** | LLM hallucinating ungrounded sources | Backend validates all citation IDs against supplied chunk list before rendering answer. | ✅ Designed |
| **Extension Permissions** | Over-privileged extension manifest | Manifest V3 scoped exclusively to `sidePanel`, `activeTab`, `scripting`, and `storage`. | ✅ Enforced |
