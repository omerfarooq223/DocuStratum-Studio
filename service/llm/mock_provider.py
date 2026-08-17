import asyncio
import time
import re
from typing import List, AsyncIterator, Optional
from service.models import (
    ChunkModel,
    GroundedAnswerResponse,
    LLMProviderStatusResponse,
    AnswerStreamEventModel,
)
from service.llm.base import LLMProvider
from service.llm.citations import extract_and_validate_citations
from service.llm.prompts import PROMPT_VERSION

class MockLLMProvider(LLMProvider):
    """
    Deterministic mock provider used for local testing, offline demo, and keyless fallback.
    """

    def __init__(self, is_configured: bool = True, model: str = "llama-3.3-70b-versatile"):
        self._is_configured = is_configured
        self._model = model

    @property
    def provider_name(self) -> str:
        return "mock_groq"

    @property
    def default_model(self) -> str:
        return self._model

    async def get_status(self) -> LLMProviderStatusResponse:
        return LLMProviderStatusResponse(
            status="configured" if self._is_configured else "unconfigured",
            provider="groq",
            model=self._model,
            hasApiKey=self._is_configured,
            isAvailable=self._is_configured,
            supportedModels=[
                "llama-3.3-70b-versatile",
                "llama-3.1-8b-instant",
                "mixtral-8x7b-32768",
            ],
            errorMessage=None if self._is_configured else "API key is not configured in service environment.",
        )

    def _determine_answer(self, query: str, chunks: List[ChunkModel]) -> tuple[str, List[str], bool]:
        query_lower = query.lower()
        query_words = set(re.findall(r"\w+", query_lower))

        # Check for unanswerable / insufficient evidence scenarios
        matching_chunks = []
        for chunk in chunks:
            chunk_words = set(re.findall(r"\w+", chunk.content.lower()))
            overlap = query_words.intersection(chunk_words)
            if len(overlap) >= 2 or any(len(w) > 5 and w in chunk_words for w in query_words):
                matching_chunks.append(chunk)

        if not matching_chunks:
            return (
                f"The provided context does not contain sufficient information to answer the question '{query}'.",
                [],
                True,
            )

        # Build grounded response citing matching chunks
        cited_ids = [c.id for c in matching_chunks[:2]]
        citations_str = " ".join([f"[{cid}]" for cid in cited_ids])
        
        primary_chunk = matching_chunks[0]
        heading_ctx = f" In the '{' > '.join(primary_chunk.headingPath)}' section," if primary_chunk.headingPath else ""
        
        # Take first sentence of matching chunk
        first_sentence = primary_chunk.content.strip().split(".")[0]
        answer_text = f"Based on the captured documentation,{heading_ctx} {first_sentence}. {citations_str}"

        return answer_text, cited_ids, False

    async def generate_answer(
        self,
        query: str,
        chunks: List[ChunkModel],
        model: Optional[str] = None,
        temperature: float = 0.1,
    ) -> GroundedAnswerResponse:
        start_time = time.perf_counter()
        active_model = model or self._model

        if not self._is_configured:
            raise RuntimeError("LLM provider is not configured. Please set GROQ_API_KEY.")

        # Simulate small inference latency
        await asyncio.sleep(0.01)

        raw_answer, raw_citations, insufficient = self._determine_answer(query, chunks)
        validated_citations, citation_refs = extract_and_validate_citations(
            raw_answer, raw_citations, chunks
        )

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

        return GroundedAnswerResponse(
            query=query,
            answer=raw_answer,
            citations=validated_citations,
            citationRefs=citation_refs,
            insufficientEvidence=insufficient,
            model=active_model,
            provider="groq",
            latencyMs=latency_ms,
            promptVersion=PROMPT_VERSION,
        )

    async def stream_answer(
        self,
        query: str,
        chunks: List[ChunkModel],
        model: Optional[str] = None,
        temperature: float = 0.1,
    ) -> AsyncIterator[AnswerStreamEventModel]:
        start_time = time.perf_counter()
        active_model = model or self._model

        if not self._is_configured:
            yield AnswerStreamEventModel(
                type="error",
                error="LLM provider is not configured. Please set GROQ_API_KEY in service environment.",
            )
            return

        raw_answer, raw_citations, insufficient = self._determine_answer(query, chunks)
        validated_citations, citation_refs = extract_and_validate_citations(
            raw_answer, raw_citations, chunks
        )

        # Stream words as tokens
        tokens = raw_answer.split(" ")
        for idx, token in enumerate(tokens):
            await asyncio.sleep(0.01)
            token_text = token if idx == 0 else " " + token
            yield AnswerStreamEventModel(type="token", token=token_text)

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

        yield AnswerStreamEventModel(
            type="done",
            answer=raw_answer,
            citations=validated_citations,
            citationRefs=citation_refs,
            insufficientEvidence=insufficient,
            model=active_model,
            provider="groq",
            latencyMs=latency_ms,
            promptVersion=PROMPT_VERSION,
        )
