import re
from typing import List, Tuple, Dict, Set
from service.models import ChunkModel, CitationRefModel

CITATION_REGEX = re.compile(r"\[(chk_[a-zA-Z0-9_\-]+)\]")

def extract_and_validate_citations(
    answer_text: str,
    raw_citations: List[str],
    available_chunks: List[ChunkModel],
) -> Tuple[List[str], List[CitationRefModel]]:
    """
    Validates citation IDs against available candidate chunks.
    Rejects any hallucinated or missing chunk IDs.
    Returns (validated_citation_ids, citation_references).
    """
    chunk_map: Dict[str, ChunkModel] = {c.id: c for c in available_chunks}
    
    # 1. Combine explicit citations array and inline [chk_xxx] regex matches
    found_in_text = CITATION_REGEX.findall(answer_text)
    combined_ids: Set[str] = set(raw_citations or []).union(found_in_text)

    # 2. Validate against candidate chunks
    validated_ids: List[str] = []
    citation_refs: List[CitationRefModel] = []

    # Preserve order of candidate chunks for consistent citation list
    for chunk in available_chunks:
        if chunk.id in combined_ids:
            validated_ids.append(chunk.id)
            
            raw_content = chunk.content.strip()
            excerpt = raw_content[:180] + ("..." if len(raw_content) > 180 else "")
            
            citation_refs.append(
                CitationRefModel(
                    chunkId=chunk.id,
                    sourceBlockIds=chunk.sourceBlockIds,
                    headingPath=chunk.headingPath or [],
                    excerpt=excerpt,
                )
            )

    return validated_ids, citation_refs
