from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime

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

class SourceAnchor(BaseModel):
    cssSelector: str
    textQuote: str
    nodePath: Optional[str] = None

class BlockModel(BaseModel):
    id: str
    type: BlockType
    content: str
    headingPath: List[str]
    sourceAnchor: SourceAnchor
    contentHash: str
    included: bool = True

class CaptureModel(BaseModel):
    id: str
    url: str
    canonicalUrl: Optional[str] = None
    title: str
    mode: CaptureMode
    timestamp: str
    extractorVersion: str = "1.0.0"
    contentHash: str
    blocks: List[BlockModel] = []
