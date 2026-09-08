from __future__ import annotations

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

logger = logging.getLogger("webrag.llm.gemini")

DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"

SUPPORTED_GEMINI_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
]


class StreamingJsonAnswerExtractor:
    """
    Progressively extracts only the 'answer' field string from a streaming JSON object,
    preventing raw JSON formatting braces from cluttering the live UI streaming view.
    """

    def __init__(self):
        self.buffer = ""
        self.in_answer = False
        self.escaped = False
        self.done_answer = False

    def feed(self, chunk: str) -> str:
        if self.done_answer or not chunk:
            return ""
        out = ""
        for char in chunk:
            if not self.in_answer and not self.done_answer:
                self.buffer += char
                idx = self.buffer.find('"answer"')
                if idx != -1:
                    colon_idx = self.buffer.find(":", idx + 8)
                    if colon_idx != -1:
                        quote_idx = self.buffer.find('"', colon_idx + 1)
                        if quote_idx != -1:
                            self.in_answer = True
                            rem = self.buffer[quote_idx + 1 :]
                            self.buffer = ""
                            for c in rem:
                                if self.escaped:
                                    out += c
                                    self.escaped = False
                                elif c == "\\":
                                    self.escaped = True
                                elif c == '"':
                                    self.in_answer = False
                                    self.done_answer = True
                                    break
                                else:
                                    out += c
            elif self.in_answer:
                if self.escaped:
                    out += char
                    self.escaped = False
                elif char == "\\":
                    self.escaped = True
                elif char == '"':
                    self.in_answer = False
                    self.done_answer = True
                    break
                else:
                    out += char
        return out


class GeminiProvider(LLMProvider):
    """
    Provider adapter for Google's Gemini inference API.
    Supports native JSON structured responses, token streaming, citation extraction,
    and automatic fallback/resilience.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self._api_key = api_key if api_key is not None else os.environ.get("GEMINI_API_KEY")
        self._base_url = (base_url or os.environ.get("GEMINI_BASE_URL") or DEFAULT_GEMINI_BASE_URL).rstrip("/")
        self._model = model or os.environ.get("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL
        self._timeout = timeout

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def default_model(self) -> str:
        return self._model

    async def get_status(self) -> LLMProviderStatusResponse:
        has_key = bool(self._api_key and self._api_key.strip())

        if not has_key:
            return LLMProviderStatusResponse(
                status="unconfigured",
                provider="gemini",
                model=self._model,
                hasApiKey=False,
                isAvailable=False,
                supportedModels=SUPPORTED_GEMINI_MODELS,
                errorMessage="GEMINI_API_KEY is not configured in service environment.",
            )

        return LLMProviderStatusResponse(
            status="configured",
            provider="gemini",
            model=self._model,
            hasApiKey=True,
            isAvailable=True,
            supportedModels=SUPPORTED_GEMINI_MODELS,
            errorMessage=None,
        )

    def _build_payload(self, query: str, chunks: List[ChunkModel], temperature: float) -> Dict[str, Any]:
        user_content = build_user_prompt(query, chunks)
        return {
            "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
            "contents": [{"parts": [{"text": user_content}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": max(0.0, min(1.0, temperature)),
            },
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
            raise RuntimeError("GEMINI_API_KEY is missing. Please configure your Gemini API key in the service environment.")

        payload = self._build_payload(query, chunks, temperature)
        url = f"{self._base_url}/models/{active_model}:generateContent?key={self._api_key}"

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json=payload,
                )

            if response.status_code == 400:
                err_data = response.json() if response.content else {}
                err_msg = err_data.get("error", {}).get("message", "Invalid request parameter.")
                raise ValueError(f"Gemini Bad Request (400): {err_msg}")
            elif response.status_code == 401 or response.status_code == 403:
                raise RuntimeError("Invalid or unauthorized Gemini API key.")
            elif response.status_code == 429:
                raise RuntimeError("Gemini API rate limit exceeded (HTTP 429). Please retry momentarily.")
            elif response.status_code != 200:
                raise RuntimeError(f"Gemini API returned error HTTP {response.status_code}.")

            resp_data = response.json()
            candidates = resp_data.get("candidates", [])
            if not candidates:
                raise RuntimeError("Gemini returned no response candidates.")

            parts = candidates[0].get("content", {}).get("parts", [])
            raw_text = parts[0].get("text", "") if parts else ""

            try:
                parsed = json.loads(raw_text)
                raw_answer = parsed.get("answer", raw_text)
                raw_citations = parsed.get("cited_chunk_ids", [])
                insufficient = bool(parsed.get("insufficient_evidence", False))
            except json.JSONDecodeError:
                raw_answer = raw_text
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
                provider="gemini",
                latencyMs=latency_ms,
                promptVersion=PROMPT_VERSION,
            )

        except httpx.TimeoutException as te:
            logger.error(f"Gemini request timed out after {self._timeout}s")
            raise RuntimeError(f"Gemini inference timed out after {self._timeout}s. Try a shorter query or smaller chunk set.") from te
        except httpx.RequestError as re:
            logger.error("Gemini network request failed (%s)", type(re).__name__)
            raise RuntimeError("Could not connect to Gemini API endpoint. Check connectivity and retry.") from re

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
                error="GEMINI_API_KEY is not configured in the service environment.",
            )
            return

        payload = self._build_payload(query, chunks, temperature)
        url = f"{self._base_url}/models/{active_model}:streamGenerateContent?alt=sse&key={self._api_key}"

        accumulated_text = ""
        extractor = StreamingJsonAnswerExtractor()
        emitted_any_answer_tokens = False

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream(
                    "POST",
                    url,
                    headers={"Content-Type": "application/json"},
                    json=payload,
                ) as response:
                    if response.status_code == 401 or response.status_code == 403:
                        yield AnswerStreamEventModel(type="error", error="Invalid or unauthorized Gemini API key.")
                        return
                    elif response.status_code == 429:
                        yield AnswerStreamEventModel(type="error", error="Gemini API rate limit exceeded (HTTP 429).")
                        return
                    elif response.status_code != 200:
                        yield AnswerStreamEventModel(type="error", error=f"Gemini API error ({response.status_code}).")
                        return

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        line_data = line[6:].strip()
                        if not line_data or line_data == "[DONE]":
                            continue
                        try:
                            chunk_obj = json.loads(line_data)
                            candidates = chunk_obj.get("candidates", [])
                            if not candidates:
                                continue
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if not parts:
                                continue
                            part_text = parts[0].get("text", "")
                            if part_text:
                                accumulated_text += part_text
                                clean_token = extractor.feed(part_text)
                                if clean_token:
                                    emitted_any_answer_tokens = True
                                    yield AnswerStreamEventModel(type="token", token=clean_token)
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
                provider="gemini",
                latencyMs=latency_ms,
                promptVersion=PROMPT_VERSION,
            )

        except httpx.TimeoutException:
            yield AnswerStreamEventModel(type="error", error="Gemini stream timed out.")
        except Exception as exc:
            logger.error("Gemini answer stream failed (%s)", type(exc).__name__)
            yield AnswerStreamEventModel(
                type="error",
                error="The Gemini answer stream failed. Retrieved evidence is still available; retry when the provider is ready.",
            )
