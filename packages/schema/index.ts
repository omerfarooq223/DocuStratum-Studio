export type CaptureMode = 'selection' | 'element' | 'page';

export interface Capture {
  id: string;
  url: string;
  canonicalUrl?: string;
  title: string;
  mode: CaptureMode;
  timestamp: string;
  extractorVersion: string;
  contentHash: string;
}

export type BlockType = 'heading' | 'paragraph' | 'list' | 'code' | 'table' | 'callout';

export interface TextQuote {
  exact: string;
  prefix?: string;
  suffix?: string;
}

export interface SourceAnchor {
  blockId: string;
  headingPath: string[];
  cssSelector: string;
  textQuote: TextQuote;
  nodePath?: string;
}

export interface BlockAttributes {
  headingLevel?: number;
  listKind?: 'ordered' | 'unordered';
  codeLanguage?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  calloutKind?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  headingPath: string[];
  sourceAnchor: SourceAnchor;
  contentHash: string;
  included: boolean;
  attributes?: BlockAttributes;
}

export interface CaptureResult {
  capture: Capture;
  blocks: Block[];
}

export type ChunkingStrategy = 'recursive' | 'heading_aware';

export interface RecursiveChunkSettings {
  maxCharacters: number;
  overlapCharacters: number;
}

export interface HeadingAwareChunkSettings {
  maxCharacters: number;
}

export interface ChunkSourceSpan {
  blockId: string;
  startOffset: number;
  endOffset: number;
  overlapCharacters: number;
}

export interface ChunkOverlap {
  fromChunkId: string;
  fromSequence: number;
  characterCount: number;
  contentHash: string;
}

export interface ChunkContinuation {
  sourceBlockId: string;
  blockType: BlockType;
  part: number;
  totalParts: number;
  reason: 'oversized' | 'boundary' | 'overlap';
}

export interface Chunk {
  id: string;
  sourceNamespace: string;
  strategy: ChunkingStrategy;
  sequence: number;
  content: string;
  sourceBlockIds: string[];
  sourceSpans: ChunkSourceSpan[];
  headingPath: string[];
  tokenCount: number;
  characterCount: number;
  contentHash: string;
  overlap?: ChunkOverlap;
  continuations?: ChunkContinuation[];
}

export interface RetrievalResult {
  chunkId: string;
  score: number;
  rank: number;
  strategy: ChunkingStrategy;
  headingPath: string[];
  excerpt: string;
  sourceBlockIds?: string[];
}

export interface ManifestFileRef {
  path: string;
  sha256: string;
}

export interface Manifest {
  formatVersion: string;
  createdAt: string;
  sourceUrl: string;
  captureHash: string;
  extractorVersion: string;
  embeddingModel: {
    name: string;
    dimension: number;
  };
  files: ManifestFileRef[];
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  schemaVersion: string;
  timestamp: string;
  requestId: string;
}

export interface VersionResponse {
  apiVersion: string;
  schemaVersion: string;
  supportedModes: CaptureMode[];
  supportedChunkers: ChunkingStrategy[];
}
