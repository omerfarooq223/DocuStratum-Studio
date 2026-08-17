from typing import List, Optional, Literal
from pydantic import BaseModel, Field

CaptureMode = Literal["selection", "element", "page"]
BlockType = Literal["heading", "paragraph", "list", "code", "table", "callout"]
ChunkingStrategy = Literal["recursive", "heading_aware"]
QuestionStatus = Literal["draft", "curated"]

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

# ----------------------------------------------------
# Day 6 Retrieval & Evaluation Models
# ----------------------------------------------------

class RetrievalQueryRequest(BaseModel):
    query: str
    strategy: ChunkingStrategy
    topK: int = Field(default=5, ge=1, le=20)
    chunks: List[ChunkModel]

class RetrievalResultItem(BaseModel):
    chunkId: str
    score: float
    rank: int
    strategy: ChunkingStrategy
    headingPath: List[str]
    excerpt: str
    sourceBlockIds: List[str]

class RetrievalQueryResponse(BaseModel):
    results: List[RetrievalResultItem]
    executionTimeMs: float

class DraftQuestionsRequest(BaseModel):
    blocks: List[BlockModel]

class TestQuestionModel(BaseModel):
    id: str
    query: str
    expectedBlockId: Optional[str] = None
    notes: Optional[str] = None
    status: QuestionStatus = "draft"
    generatedFromBlockId: Optional[str] = None
    createdAt: str
    updatedAt: str

class DraftQuestionsResponse(BaseModel):
    questions: List[TestQuestionModel]
