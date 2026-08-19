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

# Day 5 Embeddings & Vector Search Models
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

# Day 6 Retrieval Debugger & Evaluation Models
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
    __test__ = False
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

# Day 7 Grounded LLM Answers & Provider Models
LLMStatusType = Literal["configured", "unconfigured", "error", "disabled"]

class LLMProviderStatusResponse(BaseModel):
    status: LLMStatusType = "unconfigured"
    provider: str = "groq"
    model: str = "llama-3.3-70b-versatile"
    hasApiKey: bool = False
    isAvailable: bool = False
    supportedModels: List[str] = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768",
    ]
    errorMessage: Optional[str] = None

class CitationRefModel(BaseModel):
    chunkId: str
    sourceBlockIds: List[str] = Field(default_factory=list)
    headingPath: List[str] = Field(default_factory=list)
    excerpt: str

class GroundedAnswerRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    chunks: List[ChunkModel] = Field(min_length=1)
    model: Optional[str] = None
    temperature: float = Field(default=0.1, ge=0.0, le=1.0)

class GroundedAnswerResponse(BaseModel):
    query: str
    answer: str
    citations: List[str] = Field(default_factory=list)
    citationRefs: List[CitationRefModel] = Field(default_factory=list)
    insufficientEvidence: bool = False
    model: str = "llama-3.3-70b-versatile"
    provider: str = "groq"
    latencyMs: float
    promptVersion: str = "v1.0.0"

class AnswerStreamEventModel(BaseModel):
    type: Literal["token", "citations", "done", "error"]
    token: Optional[str] = None
    answer: Optional[str] = None
    citations: Optional[List[str]] = None
    citationRefs: Optional[List[CitationRefModel]] = None
    insufficientEvidence: Optional[bool] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    latencyMs: Optional[float] = None
    promptVersion: Optional[str] = None
    error: Optional[str] = None

# Day 8 Portable RAG Package Models
class ManifestFileEntry(BaseModel):
    path: str
    sha256: str
    bytes: int = Field(ge=0)
    recordCount: Optional[int] = Field(default=None, ge=0)

class ChunkerRecursiveSettings(BaseModel):
    maxCharacters: int = 700
    overlapCharacters: int = 80

class ChunkerHeadingAwareSettings(BaseModel):
    maxCharacters: int = 700

class ChunkerSettingsMetadata(BaseModel):
    recursive: Optional[ChunkerRecursiveSettings] = None
    headingAware: Optional[ChunkerHeadingAwareSettings] = None

class EmbeddingMetadata(BaseModel):
    modelName: str = "all-MiniLM-L6-v2"
    dimension: int = 384
    metric: Literal["cosine", "dot", "euclidean"] = "cosine"
    normalized: bool = True
    instructions: Optional[str] = (
        "Re-embed chunks using the specified model and metric to generate dense retrieval vectors."
    )

class GenerationMetadata(BaseModel):
    provider: str = "groq"
    model: str = "llama-3.3-70b-versatile"
    promptVersion: str = "v1.0.0"
    temperature: Optional[float] = 0.1

class SourceIdentityMetadata(BaseModel):
    url: str
    canonicalUrl: Optional[str] = None
    title: str
    mode: CaptureMode
    captureTime: str
    extractorVersion: str = "1.0.0"
    captureHash: str

class PackageManifest(BaseModel):
    formatVersion: str = "1.0.0"
    createdAt: str
    sourceIdentity: SourceIdentityMetadata
    chunkerSettings: ChunkerSettingsMetadata
    embeddingMetadata: EmbeddingMetadata
    generationMetadata: Optional[GenerationMetadata] = None
    promptVersion: Optional[str] = "v1.0.0"
    licenseNote: str = (
        "Content captured from user-specified source. Ensure compliance with origin license and terms."
    )
    files: List[ManifestFileEntry] = Field(default_factory=list)

class RetrievalEvaluationResultModel(BaseModel):
    id: str
    questionId: str
    query: str
    expectedBlockId: Optional[str] = None
    strategy: ChunkingStrategy
    topK: int = Field(default=5, ge=1, le=20)
    measuredLatencyMs: float
    results: List[RetrievalResultModel]
    hitAt1: Optional[bool] = None
    hitAt3: Optional[bool] = None
    hitAt5: Optional[bool] = None
    reciprocalRank: Optional[float] = None
    timestamp: str
    notes: Optional[str] = None

class ExportPackageRequest(BaseModel):
    captureResult: CaptureResultModel
    chunks: List[ChunkModel] = Field(default_factory=list)
    questions: Optional[List[TestQuestionModel]] = Field(default_factory=list)
    retrievalResults: Optional[List[RetrievalEvaluationResultModel]] = Field(default_factory=list)
    answers: Optional[List[GroundedAnswerResponse]] = Field(default_factory=list)
    generationMetadata: Optional[GenerationMetadata] = None

class PackageValidationIssue(BaseModel):
    severity: Literal["error", "warning"] = "error"
    file: Optional[str] = None
    code: str
    message: str

class PackageValidationReport(BaseModel):
    valid: bool
    formatVersion: Optional[str] = None
    totalFiles: int = 0
    totalBlocks: int = 0
    totalChunks: int = 0
    totalQuestions: int = 0
    totalAnswers: int = 0
    issues: List[PackageValidationIssue] = Field(default_factory=list)
    manifest: Optional[PackageManifest] = None

