# ADR 001: Monorepo Architecture & MV3 + FastAPI Walking Skeleton

## Context
WebRAG Studio requires a fast, local, privacy-aware workflow combining browser DOM interactions with CPU-efficient vector search and LLM API gateway services.

## Decision
1. **Frontend Architecture**: Build a Chrome Manifest V3 extension using React, TypeScript, and Vite. UI lives in a Chrome `side_panel` for continuous visibility alongside doc pages.
2. **Backend Architecture**: Build a Python FastAPI service running locally on `http://127.0.0.1:8000`. Handles embeddings, chunking, similarity search, LLM streaming, and ZIP package generation.
3. **Data Contracts**: Define shared TypeScript and JSON Schema interfaces (`packages/schema/`) to ensure strict contract synchronization between extension and service.
4. **Security Isolation**: `GROQ_API_KEY` exists solely in local FastAPI environment variables. Extension side panel receives sanitized response streams and validated citation IDs.

## Consequences
- **Pros**: Clear separation of concerns, zero extension bundle bloat, zero leak of API credentials, native Python ML/vector search ecosystem.
- **Cons**: Requires user to run Python local backend service alongside extension. Mitigated via clear health check status UI and automated setup scripts.
