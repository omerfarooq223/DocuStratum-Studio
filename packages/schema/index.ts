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

export interface SourceAnchor {
  cssSelector: string;
  textQuote: string;
  nodePath?: string;
}

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  headingPath: string[];
  sourceAnchor: SourceAnchor;
  contentHash: string;
  included: boolean;
}

export type ChunkingStrategy = 'recursive' | 'heading_aware';

export interface Chunk {
  id: string;
  strategy: ChunkingStrategy;
  content: string;
  sourceBlockIds: string[];
  headingPath: string[];
  tokenCount: number;
  contentHash: string;
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
