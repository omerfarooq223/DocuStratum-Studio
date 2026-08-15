from typing import List, Optional, Literal
from pydantic import BaseModel, Field

CaptureMode = Literal["selection", "element", "page"]
BlockType = Literal["heading", "paragraph", "list", "code", "table", "callout"]
ChunkingStrategy = Literal["recursive", "heading_aware"]

class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded", "unhealthy"] = "healthy"
    version: str = Field(default="0.1.0")
    schemaVersion: str = Field(default="1.0.0")
    timestamp: str
    requestId: str

class VersionResponse(BaseModel):
    apiVersion: str = Field(default="0.1.0")
    schemaVersion: str = Field(default="1.0.0")
    supportedModes: List[CaptureMode] = ["selection", "element", "page"]
    supportedChunkers: List[ChunkingStrategy] = ["recursive", "heading_aware"]

class ErrorDetail(BaseModel):
    code: str
    message: str
    requestId: str
    timestamp: str

class ErrorResponse(BaseModel):
    error: ErrorDetail

class TextQuote(BaseModel):
    exact: str
    prefix: Optional[str] = None
    suffix: Optional[str] = None

class SourceAnchor(BaseModel):
    blockId: str
    headingPath: List[str]
    cssSelector: str
    textQuote: TextQuote
    nodePath: Optional[str] = None

class BlockAttributes(BaseModel):
    headingLevel: Optional[int] = Field(default=None, ge=1, le=6)
    listKind: Optional[Literal["ordered", "unordered"]] = None
    codeLanguage: Optional[str] = None
    tableHeaders: Optional[List[str]] = None
    tableRows: Optional[List[List[str]]] = None
    calloutKind: Optional[str] = None

class BlockModel(BaseModel):
    id: str
    type: BlockType
    content: str
    headingPath: List[str]
    sourceAnchor: SourceAnchor
    contentHash: str
    included: bool = True
    attributes: Optional[BlockAttributes] = None

class CaptureModel(BaseModel):
    id: str
    url: str
    canonicalUrl: Optional[str] = None
    title: str
    mode: CaptureMode
    timestamp: str
    extractorVersion: str = "1.0.0"
    contentHash: str

class CaptureResultModel(BaseModel):
    capture: CaptureModel
    blocks: List[BlockModel] = Field(default_factory=list)

class ChunkSourceSpan(BaseModel):
    blockId: str
    startOffset: int = Field(ge=0)
    endOffset: int = Field(ge=0)
    overlapCharacters: int = Field(ge=0)

class ChunkOverlap(BaseModel):
    fromChunkId: str
    fromSequence: int = Field(ge=0)
    characterCount: int = Field(ge=1)
    contentHash: str

class ChunkContinuation(BaseModel):
    sourceBlockId: str
    blockType: BlockType
    part: int = Field(ge=1)
    totalParts: int = Field(ge=2)
    reason: Literal["oversized", "boundary", "overlap"]

class ChunkModel(BaseModel):
    id: str
    sourceNamespace: str
    strategy: ChunkingStrategy
    sequence: int = Field(ge=0)
    content: str
    sourceBlockIds: List[str]
    sourceSpans: List[ChunkSourceSpan]
    headingPath: List[str]
    tokenCount: int = Field(ge=0)
    characterCount: int = Field(ge=0)
    contentHash: str
    overlap: Optional[ChunkOverlap] = None
    continuations: Optional[List[ChunkContinuation]] = None

class ModelStatusResponse(BaseModel):
    status: Literal["ready", "loading", "unloaded", "error"] = "ready"
    modelName: str = "all-MiniLM-L6-v2"
    dimension: int = 384
    device: str = "cpu"
    cachedEmbeddingsCount: int = 0
    isLocal: bool = True

class EmbedRequest(BaseModel):
    texts: Optional[List[str]] = None
    chunks: Optional[List[ChunkModel]] = None
    model: Optional[str] = None

class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    model: str = "all-MiniLM-L6-v2"
    dimension: int = 384
    latencyMs: float
    cachedCount: int = 0
    computedCount: int = 0

class RetrievalResultModel(BaseModel):
    chunkId: str
    score: float = Field(ge=-1.0, le=1.0)
    rank: int = Field(ge=1)
    strategy: ChunkingStrategy
    headingPath: List[str] = Field(default_factory=list)
    excerpt: str
    sourceBlockIds: List[str] = Field(default_factory=list)

class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    chunks: List[ChunkModel] = Field(min_length=1)
    topK: int = Field(default=5, ge=1, le=50)
    strategy: Optional[ChunkingStrategy] = None

class SearchResponse(BaseModel):
    query: str
    results: List[RetrievalResultModel]
    latencyMs: float
    model: str = "all-MiniLM-L6-v2"
    dimension: int = 384
    totalCandidates: int

