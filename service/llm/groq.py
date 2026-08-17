import json
import logging
import os
import time
from typing import List, AsyncIterator, Optional, Dict, Any
import httpx

from service.models import (
    ChunkModel,
    GroundedAnswerResponse,
    LLMProviderStatusResponse,
    AnswerStreamEventModel,
)
from service.llm.base import LLMProvider
from service.llm.citations import extract_and_validate_citations
from service.llm.prompts import SYSTEM_INSTRUCTION, build_user_prompt, PROMPT_VERSION

logger = logging.getLogger("webrag.llm.groq")

DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
FALLBACK_GROQ_MODEL = "llama-3.1-8b-instant"

SUPPORTED_GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
]

class GroqProvider(LLMProvider):
    """
    Provider adapter for Groq's high-speed inference API (and OpenAI-compatible endpoints).
    Manages authentication isolation, streaming, JSON schema grounding, and error recovery.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self._api_key = api_key or os.environ.get("GROQ_API_KEY")
        self._base_url = (base_url or os.environ.get("GROQ_BASE_URL") or DEFAULT_GROQ_BASE_URL).rstrip("/")
        self._model = model or os.environ.get("GROQ_MODEL") or DEFAULT_GROQ_MODEL
        self._timeout = timeout

    @property
    def provider_name(self) -> str:
        return "groq"

    @property
    def default_model(self) -> str:
        return self._model

    async def get_status(self) -> LLMProviderStatusResponse:
        has_key = bool(self._api_key and self._api_key.strip())
        
        if not has_key:
            return LLMProviderStatusResponse(
                status="unconfigured",
                provider="groq",
                model=self._model,
                hasApiKey=False,
                isAvailable=False,
                supportedModels=SUPPORTED_GROQ_MODELS,
                errorMessage="API key is not configured in service environment.",
            )

        return LLMProviderStatusResponse(
            status="configured",
            provider="groq",
            model=self._model,
            hasApiKey=True,
            isAvailable=True,
            supportedModels=SUPPORTED_GROQ_MODELS,
            errorMessage=None,
        )

    def _headers(self) -> Dict[str, str]:
        if not self._api_key:
            raise ValueError("GROQ_API_KEY is not configured.")
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    async def generate_answer(
        self,
        query: str,
        chunks: List[ChunkModel],
        model: Optional[str] = None,
        temperature: float = 0.1,
    ) -> GroundedAnswerResponse:
        start_time = time.perf_counter()
        active_model = model or self._model

        if not self._api_key:
            raise RuntimeError("GROQ_API_KEY is missing. Please configure your Groq API key in the service environment.")

        user_content = build_user_prompt(query, chunks)

        payload = {
            "model": active_model,
            "messages": [
                {"role": "system", "content": SYSTEM_INSTRUCTION},
                {"role": "user", "content": user_content},
            ],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self._base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                )

            if response.status_code == 401:
                raise RuntimeError("Invalid Groq API key (HTTP 401). Please check GROQ_API_KEY in your environment.")
            elif response.status_code == 429:
                raise RuntimeError("Groq API rate limit reached (HTTP 429). Please wait a moment and try again.")
            elif response.status_code >= 500:
                raise RuntimeError(f"Groq upstream service error (HTTP {response.status_code}). Please try again later.")
            elif response.status_code != 200:
                raise RuntimeError(f"Groq API error ({response.status_code}): {response.text}")

            data = response.json()
            message_content = data["choices"][0]["message"]["content"]
            
            # Parse structured JSON output
            try:
                parsed = json.loads(message_content)
                raw_answer = parsed.get("answer", message_content)
                raw_citations = parsed.get("cited_chunk_ids", [])
                insufficient = bool(parsed.get("insufficient_evidence", False))
            except json.JSONDecodeError:
                raw_answer = message_content
                raw_citations = []
                insufficient = False

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

        except httpx.TimeoutException as te:
            logger.error(f"Groq request timed out after {self._timeout}s")
            raise RuntimeError(f"Groq inference timed out after {self._timeout}s. Try a shorter query or smaller chunk set.") from te
        except httpx.RequestError as re:
            logger.error(f"Network error reaching Groq API: {re}")
            raise RuntimeError(f"Could not connect to Groq API ({self._base_url}): {str(re)}") from re

    async def stream_answer(
        self,
        query: str,
        chunks: List[ChunkModel],
        model: Optional[str] = None,
        temperature: float = 0.1,
    ) -> AsyncIterator[AnswerStreamEventModel]:
        start_time = time.perf_counter()
        active_model = model or self._model

        if not self._api_key:
            yield AnswerStreamEventModel(
                type="error",
                error="GROQ_API_KEY is not configured in the service environment.",
            )
            return

        user_content = build_user_prompt(query, chunks)

        payload = {
            "model": active_model,
            "messages": [
                {"role": "system", "content": SYSTEM_INSTRUCTION},
                {"role": "user", "content": user_content},
            ],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "stream": True,
        }

        accumulated_text = ""

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self._base_url}/chat/completions",
                    headers=self._headers(),
                    json=payload,
                ) as response:
                    if response.status_code == 401:
                        yield AnswerStreamEventModel(type="error", error="Invalid Groq API key (HTTP 401).")
                        return
                    elif response.status_code == 429:
                        yield AnswerStreamEventModel(type="error", error="Groq API rate limit exceeded (HTTP 429).")
                        return
                    elif response.status_code != 200:
                        yield AnswerStreamEventModel(type="error", error=f"Groq API error ({response.status_code}).")
                        return

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        line_data = line[6:].strip()
                        if line_data == "[DONE]":
                            break
                        try:
                            chunk_obj = json.loads(line_data)
                            delta = chunk_obj["choices"][0]["delta"]
                            token = delta.get("content", "")
                            if token:
                                accumulated_text += token
                                yield AnswerStreamEventModel(type="token", token=token)
                        except Exception:
                            continue

            # Parse accumulated JSON
            try:
                parsed = json.loads(accumulated_text)
                raw_answer = parsed.get("answer", accumulated_text)
                raw_citations = parsed.get("cited_chunk_ids", [])
                insufficient = bool(parsed.get("insufficient_evidence", False))
            except json.JSONDecodeError:
                raw_answer = accumulated_text
                raw_citations = []
                insufficient = False

            validated_citations, citation_refs = extract_and_validate_citations(
                raw_answer, raw_citations, chunks
            )

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

        except httpx.TimeoutException:
            yield AnswerStreamEventModel(type="error", error="Groq stream timed out.")
        except Exception as e:
            logger.error(f"Error during Groq answer streaming: {e}", exc_info=True)
            yield AnswerStreamEventModel(type="error", error=f"Stream error: {str(e)}")
