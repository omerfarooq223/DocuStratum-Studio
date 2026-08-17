from abc import ABC, abstractmethod
from typing import List, AsyncIterator, Optional, Dict, Any
from service.models import (
    ChunkModel,
    GroundedAnswerResponse,
    LLMProviderStatusResponse,
    AnswerStreamEventModel,
)

class LLMProvider(ABC):
    """
    Abstract interface for LLM providers generating grounded, citation-backed answers.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @property
    @abstractmethod
    def default_model(self) -> str:
        pass

    @abstractmethod
    async def get_status(self) -> LLMProviderStatusResponse:
        """
        Returns real-time provider configuration, model info, and readiness status.
        Never exposes secrets or API keys.
        """
        pass

    @abstractmethod
    async def generate_answer(
        self,
        query: str,
        chunks: List[ChunkModel],
        model: Optional[str] = None,
        temperature: float = 0.1,
    ) -> GroundedAnswerResponse:
        """
        Generates a structured, grounded answer citing only provided chunks.
        """
        pass

    @abstractmethod
    async def stream_answer(
        self,
        query: str,
        chunks: List[ChunkModel],
        model: Optional[str] = None,
        temperature: float = 0.1,
    ) -> AsyncIterator[AnswerStreamEventModel]:
        """
        Streams answer tokens as they are produced, concluding with structured citation metadata.
        """
        pass
