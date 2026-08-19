import hashlib
import json
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from service.models import (
    PackageManifest,
    ManifestFileEntry,
    SourceIdentityMetadata,
    ChunkerSettingsMetadata,
    ChunkerRecursiveSettings,
    ChunkerHeadingAwareSettings,
    EmbeddingMetadata,
    GenerationMetadata,
    CaptureModel,
    ChunkModel,
)


def compute_sha256_bytes(data: bytes) -> str:
    """Computes SHA-256 hexadecimal digest for raw bytes."""
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


def compute_sha256_text(text: str) -> str:
    """Computes SHA-256 hexadecimal digest for a UTF-8 string."""
    return compute_sha256_bytes(text.encode("utf-8"))


def sanitize_generation_metadata(gen_meta: Optional[GenerationMetadata]) -> Optional[GenerationMetadata]:
    """Ensures generation metadata contains no API keys, secrets, or headers."""
    if not gen_meta:
        return None
    # Strictly copy only safe fields: provider, model, promptVersion, temperature
    return GenerationMetadata(
        provider=gen_meta.provider,
        model=gen_meta.model,
        promptVersion=gen_meta.promptVersion,
        temperature=gen_meta.temperature,
    )


def create_manifest(
    capture: CaptureModel,
    file_entries: List[ManifestFileEntry],
    recursive_settings: Optional[ChunkerRecursiveSettings] = None,
    heading_aware_settings: Optional[ChunkerHeadingAwareSettings] = None,
    embedding_meta: Optional[EmbeddingMetadata] = None,
    generation_meta: Optional[GenerationMetadata] = None,
    prompt_version: str = "v1.0.0",
) -> PackageManifest:
    """Constructs a validated PackageManifest for the exported RAG package."""
    now_iso = datetime.now(timezone.utc).isoformat()
    
    source_identity = SourceIdentityMetadata(
        url=capture.url,
        canonicalUrl=capture.canonicalUrl,
        title=capture.title,
        mode=capture.mode,
        captureTime=capture.timestamp,
        extractorVersion=capture.extractorVersion,
        captureHash=capture.contentHash,
    )

    chunker_settings = ChunkerSettingsMetadata(
        recursive=recursive_settings or ChunkerRecursiveSettings(),
        headingAware=heading_aware_settings or ChunkerHeadingAwareSettings(),
    )

    emb_meta = embedding_meta or EmbeddingMetadata()
    sanitized_gen = sanitize_generation_metadata(generation_meta)

    return PackageManifest(
        formatVersion="1.0.0",
        createdAt=now_iso,
        sourceIdentity=source_identity,
        chunkerSettings=chunker_settings,
        embeddingMetadata=emb_meta,
        generationMetadata=sanitized_gen,
        promptVersion=prompt_version,
        licenseNote=(
            "Content captured from user-specified web source. "
            "Ensure compliance with origin source copyright, licensing, and terms of service."
        ),
        files=file_entries,
    )
