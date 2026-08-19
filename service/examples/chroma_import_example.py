"""
Example 2: Optional ChromaDB Import Integration
Demonstrates consuming a WebRAG portable package ZIP and populating a local ChromaDB collection.
Includes metadata mappings for chunk strategy, sequence, heading paths, and block IDs.
"""

import sys
import os
from pathlib import Path
from typing import List, Dict, Any

# Ensure repository root is on PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from service.packager.loader import RAGPackage


def run_chroma_import_example(package_path_or_bytes):
    print("=" * 70)
    print(" WebRAG Portable Package: ChromaDB Vector Store Import Example")
    print("=" * 70)

    try:
        import chromadb
        from chromadb.utils import embedding_functions
    except ImportError:
        print("\n⚠️  ChromaDB is not installed in the current environment.")
        print("To run this optional integration:")
        print("    pip install chromadb")
        print("\nDemonstrating schema transformation logic without database insertion:")
        _demonstrate_chroma_document_preparation(package_path_or_bytes)
        return

    # 1. Open package with zero external dependencies
    with RAGPackage.open(package_path_or_bytes) as pkg:
        report = pkg.validate()
        if not report.valid:
            print(f"❌ Package validation failed: {report.issues}")
            return

        src = pkg.source_identity
        emb_meta = pkg.embedding_metadata
        print(f"\n[Step 1] Initializing Chroma in-memory client...")
        client = chromadb.Client()
        collection_name = f"webrag_{src.get('title', 'docs').lower().replace(' ', '_')[:30]}"
        
        # Configure embedding function matching manifest specification
        ef = embedding_functions.DefaultEmbeddingFunction()
        collection = client.create_collection(
            name=collection_name,
            embedding_function=ef,
            metadata={"source_url": src.get("url", ""), "format_version": pkg.format_version},
        )

        print(f"\n[Step 2] Transforming and importing chunks into Chroma collection '{collection_name}'...")
        documents: List[str] = []
        metadatas: List[Dict[str, Any]] = []
        ids: List[str] = []

        for chunk in pkg.iter_chunks():
            ids.append(chunk["id"])
            documents.append(chunk["content"])
            metadatas.append({
                "strategy": chunk["strategy"],
                "sequence": chunk["sequence"],
                "heading": " > ".join(chunk.get("headingPath", [])),
                "source_blocks": ",".join(chunk.get("sourceBlockIds", [])),
                "token_count": chunk.get("tokenCount", 0),
            })

        collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids,
        )
        print(f"✅ Successfully inserted {len(ids)} chunks into ChromaDB!")

        # Query the collection
        query = "How to configure authentication tokens?"
        print(f"\n[Step 3] Querying ChromaDB with: \"{query}\"")
        results = collection.query(query_texts=[query], n_results=min(2, len(ids)))

        print("\n[Step 4] Chroma Search Results:")
        for idx, (doc, meta, doc_id) in enumerate(
            zip(results["documents"][0], results["metadatas"][0], results["ids"][0])
        ):
            print(f"\n  Result #{idx + 1} (Chunk ID: {doc_id})")
            print(f"  Heading: {meta.get('heading')}")
            print(f"  Source Blocks: {meta.get('source_blocks')}")
            print(f"  Text: {doc[:100]}...")


def _demonstrate_chroma_document_preparation(package_path_or_bytes):
    with RAGPackage.open(package_path_or_bytes) as pkg:
        print("\nTransformed Chroma Documents:")
        for idx, chunk in enumerate(pkg.iter_chunks()):
            print(f"\n--- Document #{idx + 1} ---")
            print(f"  ID:       {chunk['id']}")
            print(f"  Metadata: strategy={chunk['strategy']}, heading={' > '.join(chunk.get('headingPath', []))}")
            print(f"  Text:     {chunk['content'][:100]}...")


if __name__ == "__main__":
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        run_chroma_import_example(sys.argv[1])
    else:
        from service.models import CaptureModel, BlockModel, SourceAnchor, TextQuote, CaptureResultModel, ChunkModel, ChunkSourceSpan
        from service.packager.exporter import PackageExporter

        cap = CaptureModel(
            id="cap_demo_chroma",
            url="https://docs.example.com/quickstart",
            title="Quickstart Guide",
            mode="page",
            timestamp="2026-08-19T10:00:00Z",
            extractorVersion="1.0.0",
            contentHash="hash_quickstart",
        )
        b1 = BlockModel(
            id="b_10",
            type="paragraph",
            content="Welcome to the Quickstart tutorial for configuring client tokens and headers.",
            headingPath=["Quickstart"],
            sourceAnchor=SourceAnchor(
                blockId="b_10",
                headingPath=["Quickstart"],
                cssSelector="p",
                textQuote=TextQuote(exact="Welcome to the Quickstart..."),
            ),
            contentHash="hash_b10",
            included=True,
        )
        c1 = ChunkModel(
            id="chk_chroma_1",
            sourceNamespace="cap_demo_chroma",
            strategy="heading_aware",
            sequence=0,
            content="Welcome to the Quickstart tutorial for configuring client tokens and headers.",
            sourceBlockIds=["b_10"],
            sourceSpans=[ChunkSourceSpan(blockId="b_10", startOffset=0, endOffset=74, overlapCharacters=0)],
            headingPath=["Quickstart"],
            tokenCount=12,
            characterCount=74,
            contentHash="hash_c1",
        )
        zip_bytes, _ = PackageExporter.build_package_zip(
            capture_result=CaptureResultModel(capture=cap, blocks=[b1]),
            chunks=[c1],
        )
        run_chroma_import_example(zip_bytes)
