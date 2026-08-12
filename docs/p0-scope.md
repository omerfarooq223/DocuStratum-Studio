# WebRAG Studio - P0 Scope Contract & Acceptance Criteria

## 1. Primary Objective
Build a local-first Chrome extension and FastAPI service to extract clean DOM blocks, compare chunking strategies, perform local vector retrieval, generate citation-backed Groq/LLM answers, and export reproducible RAG packages.

## 2. Core P0 Features

### Capture & DOM Normalization
- Manifest V3 extension with React side panel.
- Capture modes: Selection, Element picker, and full Cleaned Page.
- Semantic block types: Heading, Paragraph, List, Code block, Table, Callout/Quote.
- Exclusion of scripts, styles, forms, inputs, passwords, navigation, and hidden DOM elements.
- Resilient source provenance anchors (URL, block ID, heading path, text quote, CSS selector).

### Block Review & Cleaning
- Interactive block tree preview.
- Include/exclude block toggles and Markdown output preview.

### Chunking & Comparison
- Deterministic chunking: Recursive text splitter vs Heading-aware splitter.
- Side-by-side chunk comparison, size distribution, and source block highlights.

### Local Embeddings & Vector Search
- Local open-source sentence embedding model.
- Vector normalization, cosine similarity search, top-5 retrieval results with score & rank.
- Deep-linking source passage highlight on source web page.

### Grounded LLM Answers & Provider Resilience
- Provider-agnostic LLM interface with Groq as default adapter.
- Local API key isolation (`GROQ_API_KEY` stored exclusively in FastAPI server).
- Mandatory citation validation against retrieved chunk IDs.
- Provider-disabled fallback mode allowing retrieval/export without internet or LLM.

### Portable RAG Package Export & Loader
- Standard ZIP containing `manifest.json`, `source/cleaned.md`, `source/blocks.jsonl`, `chunks/chunks.jsonl`, `evaluation/`, and `README.md`.
- Plain Python package loader script validating checksums and loading chunks.
