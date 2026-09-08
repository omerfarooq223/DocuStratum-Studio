import os
from typing import Optional
from service.llm.base import LLMProvider
from service.llm.gemini import GeminiProvider
from service.llm.groq import GroqProvider
from service.llm.mock_provider import MockLLMProvider

_provider_instance: Optional[LLMProvider] = None

def get_llm_provider(force_mock: Optional[bool] = None) -> LLMProvider:
    """
    Returns the configured LLM provider singleton.
    Prioritizes GeminiProvider if GEMINI_API_KEY is present, then GroqProvider if GROQ_API_KEY is present,
    with MockLLMProvider for test/offline use.
    """
    global _provider_instance

    if force_mock is True or os.environ.get("USE_MOCK_LLM") == "1":
        return MockLLMProvider(is_configured=True)

    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    if gemini_api_key and gemini_api_key.strip():
        return GeminiProvider(api_key=gemini_api_key)

    groq_api_key = os.environ.get("GROQ_API_KEY")
    if groq_api_key and groq_api_key.strip():
        return GroqProvider(api_key=groq_api_key)

    # Keyless / unconfigured fallback
    return MockLLMProvider(is_configured=False)

