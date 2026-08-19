"""
Example 1: Downstream Similarity Search Integration
Loads a WebRAG portable package ZIP, reads chunks with full block provenance,
re-embeds them using the pinned embedding model metadata, and executes cosine similarity retrieval.
"""

import sys
import os
from pathlib import Path
from typing import List, Dict, Any

# Ensure repository root is on PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from service.packager.loader import RAGPackage
from service.embeddings import EmbeddingEngine
from service.models import ChunkModel, ChunkSourceSpan


def run_similarity_search_example(package_path_or_bytes):
    print("=" * 70)
    print(" WebRAG Portable Package: Downstream Similarity Search Example")
    print("=" * 70)

    # 1. Open the portable package with zero external dependencies
    with RAGPackage.open(package_path_or_bytes) as pkg:
        # 2. Self-validate cryptographic checksums and referential integrity
        print("\n[Step 1] Validating package integrity...")
        report = pkg.validate()
        if not report.valid:
            print(f"❌ Package validation failed with {len(report.issues)} errors!")
            for issue in report.issues:
                print(f"  - [{issue.code}] {issue.message}")
            return
        print(f"✅ Package validated successfully! (Format Version: {report.formatVersion})")

        # 3. Read metadata
        src = pkg.source_identity
        emb_meta = pkg.embedding_metadata
        print(f"\n[Step 2] Loaded Package Metadata:")
        print(f"  • Source URL:       {src.get('url')}")
        print(f"  • Source Title:     {src.get('title')}")
        print(f"  • Extractor:        {src.get('extractorVersion')}")
        print(f"  • Target Embedding: {emb_meta.get('modelName')} ({emb_meta.get('dimension')}d, {emb_meta.get('metric')})")

        # 4. Stream chunks and re-embed locally
        print(f"\n[Step 3] Loading chunks and calculating local embeddings...")
        chunks_data = list(pkg.iter_chunks())
        print(f"  • Loaded {len(chunks_data)} chunks from package.")

        # Convert dicts to ChunkModel for embedding engine
        chunk_models: List[ChunkModel] = []
        for c in chunks_data:
            spans = [ChunkSourceSpan(**s) for s in c.get("sourceSpans", [])]
            chunk_models.append(
                ChunkModel(
                    id=c["id"],
                    sourceNamespace=c["sourceNamespace"],
                    strategy=c["strategy"],
                    sequence=c["sequence"],
                    content=c["content"],
                    sourceBlockIds=c["sourceBlockIds"],
                    sourceSpans=spans,
                    headingPath=c.get("headingPath", []),
                    tokenCount=c.get("tokenCount", 0),
                    characterCount=c.get("characterCount", 0),
                    contentHash=c["contentHash"],
                )
            )

        # 5. Execute vector search with EmbeddingEngine
        engine = EmbeddingEngine.get_instance(model_name=emb_meta.get("modelName", "all-MiniLM-L6-v2"))
        sample_query = "How to authenticate and configure API access?"
        print(f"\n[Step 4] Running vector retrieval for query:")
        print(f"  🔍 \"{sample_query}\"")

        search_response = engine.search(
            query=sample_query,
            chunks=chunk_models,
            top_k=3,
        )

        print(f"\n[Step 5] Top {len(search_response.results)} Retrieved Results (Search Latency: {search_response.latencyMs}ms):")
        for res in search_response.results:
            prov = pkg.get_chunk_with_provenance(res.chunkId)
            heading_str = " > ".join(res.headingPath) if res.headingPath else "Root"
            print(f"\n  🏆 Rank #{res.rank} | Score: {res.score:.4f} | Chunk ID: {res.chunkId}")
            print(f"     Heading: {heading_str}")
            print(f"     Strategy: {res.strategy}")
            print(f"     Excerpt: {res.excerpt[:120]}...")
            if prov and prov.get("sourceBlocks"):
                block_ids = [b["id"] for b in prov["sourceBlocks"]]
                print(f"     Contributing Source Block IDs: {block_ids}")

        print("\n" + "=" * 70)
        print(" Similarity Search Integration Complete!")
        print("=" * 70)


if __name__ == "__main__":
    # If a package path is passed via CLI, use it; otherwise build a fixture package
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        run_similarity_search_example(sys.argv[1])
    else:
        # Build an in-memory sample package for demonstration
        from service.models import CaptureModel, BlockModel, SourceAnchor, TextQuote, CaptureResultModel
        from service.packager.exporter import PackageExporter

        print("No package path provided; generating temporary in-memory sample package...")
        cap = CaptureModel(
            id="cap_demo_1",
            url="https://docs.example.com/auth",
            title="Authentication & API Security Guide",
            mode="page",
            timestamp="2026-08-19T10:00:00Z",
            extractorVersion="1.0.0",
            contentHash="abc123hash",
        )
        b1 = BlockModel(
            id="b_1",
            type="heading",
            content="Authentication Setup",
            headingPath=["Authentication Setup"],
            sourceAnchor=SourceAnchor(
                blockId="b_1",
                headingPath=["Authentication Setup"],
                cssSelector="h1#auth",
                textQuote=TextQuote(exact="Authentication Setup"),
            ),
            contentHash="h1_hash",
            included=True,
        )
        b2 = BlockModel(
            id="b_2",
            type="paragraph",
            content="To authenticate API requests, generate an API key in your developer console and provide it in the Authorization header as Bearer token.",
            headingPath=["Authentication Setup"],
            sourceAnchor=SourceAnchor(
                blockId="b_2",
                headingPath=["Authentication Setup"],
                cssSelector="p.auth-desc",
                textQuote=TextQuote(exact="To authenticate API requests..."),
            ),
            contentHash="p2_hash",
            included=True,
        )
        c1 = ChunkModel(
            id="chk_rec_1",
            sourceNamespace="cap_demo_1",
            strategy="recursive",
            sequence=0,
            content="Authentication Setup\nTo authenticate API requests, generate an API key in your developer console and provide it in the Authorization header as Bearer token.",
            sourceBlockIds=["b_1", "b_2"],
            sourceSpans=[
                ChunkSourceSpan(blockId="b_1", startOffset=0, endOffset=20, overlapCharacters=0),
                ChunkSourceSpan(blockId="b_2", startOffset=21, endOffset=160, overlapCharacters=0),
            ],
            headingPath=["Authentication Setup"],
            tokenCount=28,
            characterCount=160,
            contentHash="chk_hash_1",
        )

        zip_bytes, _ = PackageExporter.build_package_zip(
            capture_result=CaptureResultModel(capture=cap, blocks=[b1, b2]),
            chunks=[c1],
        )

        run_similarity_search_example(zip_bytes)
