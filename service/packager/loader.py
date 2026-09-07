import io
import json
import zipfile
from pathlib import Path
from typing import Dict, Any, List, Optional, Iterator, Union

from service.models import PackageValidationReport
from service.packager.validator import validate_package_zip


class RAGPackage:
    """
    Lightweight, zero-dependency Python loader for WebRAG portable packages.
    Enables downstream scripts to stream blocks, chunks, evaluation sets, and resolve
    complete chunk-to-block provenance directly from exported ZIP archives.
    """

    def __init__(self, zip_archive: zipfile.ZipFile, raw_source: Optional[Union[bytes, str, Path]] = None):
        self._zf = zip_archive
        self._raw_source = raw_source
        self._manifest_dict: Optional[Dict[str, Any]] = None
        self._blocks_cache: Optional[Dict[str, Dict[str, Any]]] = None
        self._chunks_cache: Optional[Dict[str, Dict[str, Any]]] = None

    @classmethod
    def open(cls, source: Union[str, Path, bytes, io.BytesIO]) -> "RAGPackage":
        """Opens a portable RAG package from a file path, raw bytes, or BytesIO buffer."""
        if isinstance(source, (str, Path)):
            zf = zipfile.ZipFile(str(source), "r")
            return cls(zf, raw_source=str(source))
        elif isinstance(source, bytes):
            zf = zipfile.ZipFile(io.BytesIO(source), "r")
            return cls(zf, raw_source=source)
        elif isinstance(source, io.BytesIO):
            zf = zipfile.ZipFile(source, "r")
            return cls(zf, raw_source=source.getvalue())
        else:
            raise TypeError(f"Unsupported package source type: {type(source)}")

    def __enter__(self) -> "RAGPackage":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def close(self):
        """Closes the underlying ZIP file handle."""
        if self._zf:
            self._zf.close()

    @property
    def manifest(self) -> Dict[str, Any]:
        """Returns the parsed manifest.json dictionary."""
        if self._manifest_dict is None:
            data = self._zf.read("manifest.json").decode("utf-8")
            self._manifest_dict = json.loads(data)
        return self._manifest_dict

    @property
    def format_version(self) -> str:
        return self.manifest.get("formatVersion", "1.0.0")

    @property
    def source_identity(self) -> Dict[str, Any]:
        return self.manifest.get("sourceIdentity", {})

    @property
    def embedding_metadata(self) -> Dict[str, Any]:
        return self.manifest.get("embeddingMetadata", {})

    @property
    def chunker_settings(self) -> Dict[str, Any]:
        return self.manifest.get("chunkerSettings", {})

    @property
    def generation_metadata(self) -> Optional[Dict[str, Any]]:
        return self.manifest.get("generationMetadata")

    def get_cleaned_markdown(self) -> str:
        """Returns the full text of source/cleaned.md."""
        if "source/cleaned.md" in self._zf.namelist():
            return self._zf.read("source/cleaned.md").decode("utf-8")
        return ""

    def get_readme(self) -> str:
        """Returns the full text of package README.md."""
        if "README.md" in self._zf.namelist():
            return self._zf.read("README.md").decode("utf-8")
        return ""

    def _iter_jsonl(self, path: str) -> Iterator[Dict[str, Any]]:
        """Internal generator reading lines from a JSONL file in the archive."""
        if path not in self._zf.namelist():
            return
        with self._zf.open(path, "r") as f:
            for line in f:
                decoded = line.decode("utf-8").strip()
                if decoded:
                    yield json.loads(decoded)

    def iter_blocks(self) -> Iterator[Dict[str, Any]]:
        """Yields semantic block dictionaries from source/blocks.jsonl."""
        return self._iter_jsonl("source/blocks.jsonl")

    def iter_chunks(self) -> Iterator[Dict[str, Any]]:
        """Yields chunk dictionaries from chunks/chunks.jsonl."""
        return self._iter_jsonl("chunks/chunks.jsonl")

    def iter_questions(self) -> Iterator[Dict[str, Any]]:
        """Yields evaluation test question dictionaries from evaluation/questions.jsonl."""
        return self._iter_jsonl("evaluation/questions.jsonl")

    def iter_retrieval_results(self) -> Iterator[Dict[str, Any]]:
        """Yields retrieval evaluation runs from evaluation/retrieval-results.jsonl."""
        return self._iter_jsonl("evaluation/retrieval-results.jsonl")

    def iter_answers(self) -> Iterator[Dict[str, Any]]:
        """Yields grounded answers from evaluation/answers.jsonl."""
        return self._iter_jsonl("evaluation/answers.jsonl")

    def _ensure_blocks_cache(self):
        if self._blocks_cache is None:
            self._blocks_cache = {}
            for b in self.iter_blocks():
                if "id" in b:
                    self._blocks_cache[b["id"]] = b

    def _ensure_chunks_cache(self):
        if self._chunks_cache is None:
            self._chunks_cache = {}
            for c in self.iter_chunks():
                if "id" in c:
                    self._chunks_cache[c["id"]] = c

    def get_block(self, block_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single block by ID."""
        self._ensure_blocks_cache()
        return self._blocks_cache.get(block_id)

    def get_chunk(self, chunk_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single chunk by ID."""
        self._ensure_chunks_cache()
        return self._chunks_cache.get(chunk_id)

    def get_chunk_with_provenance(self, chunk_id: str) -> Optional[Dict[str, Any]]:
        """
        Resolves a chunk along with its complete contributing source blocks,
        heading hierarchy, and source anchor references.
        """
        chunk = self.get_chunk(chunk_id)
        if not chunk:
            return None

        self._ensure_blocks_cache()
        source_blocks = [
            self._blocks_cache[b_id]
            for b_id in chunk.get("sourceBlockIds", [])
            if b_id in self._blocks_cache
        ]

        return {
            "chunk": chunk,
            "sourceBlocks": source_blocks,
            "headingPath": chunk.get("headingPath", []),
            "strategy": chunk.get("strategy"),
            "tokenCount": chunk.get("tokenCount", 0),
            "characterCount": chunk.get("characterCount", 0),
        }

    def validate(self) -> PackageValidationReport:
        """
        Validates the package's cryptographic checksums and referential integrity.
        """
        if self._raw_source is not None:
            return validate_package_zip(self._raw_source)
        # Fallback: re-read ZIP as buffer
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as out_zf:
            for item in self._zf.infolist():
                out_zf.writestr(item, self._zf.read(item.filename))
        return validate_package_zip(buffer.getvalue())

    def print_summary(self):
        """Prints a human-readable CLI summary of the package."""
        src = self.source_identity
        emb = self.embedding_metadata
        blocks = list(self.iter_blocks())
        chunks = list(self.iter_chunks())
        questions = list(self.iter_questions())
        answers = list(self.iter_answers())

        print("=" * 60)
        print(" DocuStratum Portable Package Summary")
        print("=" * 60)
        print(f" Source URL:   {src.get('url', 'N/A')}")
        print(f" Page Title:   {src.get('title', 'N/A')}")
        print(f" Captured At:  {src.get('captureTime', 'N/A')}")
        print(f" Format Ver:   {self.format_version}")
        print(f" Model Spec:   {emb.get('modelName')} ({emb.get('dimension')}d, {emb.get('metric')})")
        print("-" * 60)
        print(f" Total Blocks:     {len(blocks)}")
        print(f" Total Chunks:     {len(chunks)}")
        print(f" Test Questions:   {len(questions)}")
        print(f" Grounded Answers: {len(answers)}")
        print("=" * 60)
