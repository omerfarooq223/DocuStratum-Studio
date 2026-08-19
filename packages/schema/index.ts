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
  sourceBlockIds: string[];
}

// ----------------------------------------------------
// Day 6 Evaluation & Highlight Models
// ----------------------------------------------------

export type QuestionStatus = 'draft' | 'curated';

export interface TestQuestion {
  id: string;
  query: string;
  expectedBlockId?: string;
  notes?: string;
  status: QuestionStatus;
  generatedFromBlockId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetrievalRunConfig {
  topK: number;
  strategy: ChunkingStrategy;
  captureId: string;
}

export interface RetrievalEvaluationResult {
  id: string;
  questionId: string;
  query: string;
  expectedBlockId?: string;
  strategy: ChunkingStrategy;
  topK: number;
  measuredLatencyMs: number;
  results: RetrievalResult[];
  hitAt1?: boolean;
  hitAt3?: boolean;
  hitAt5?: boolean;
  reciprocalRank?: number;
  timestamp: string;
  notes?: string;
}

export interface HighlightTarget {
  blockId: string;
  cssSelector: string;
  textQuote: TextQuote;
  nodePath?: string;
}

export interface HighlightResponse {
  ok: boolean;
  status: 'highlighted' | 'stale' | 'not_found';
  reason?: string;
  matchedText?: string;
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

export interface ModelStatusResponse {
  status: 'ready' | 'loading' | 'unloaded' | 'error';
  modelName: string;
  dimension: number;
  device: string;
  cachedEmbeddingsCount: number;
  isLocal: boolean;
}

export interface EmbedRequest {
  texts?: string[];
  chunks?: Chunk[];
  model?: string;
}

export interface EmbedResponse {
  embeddings: number[][];
  model: string;
  dimension: number;
  latencyMs: number;
  cachedCount: number;
  computedCount: number;
}

export interface SearchRequest {
  query: string;
  chunks: Chunk[];
  topK?: number;
  strategy?: ChunkingStrategy;
}

export interface SearchResponse {
  query: string;
  results: RetrievalResult[];
  latencyMs: number;
  model: string;
  dimension: number;
  totalCandidates: number;
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

// ----------------------------------------------------
// Day 7 Grounded LLM Answers & Provider Resilience
// ----------------------------------------------------

export type LLMProviderStatus = 'configured' | 'unconfigured' | 'error' | 'disabled';

export interface LLMProviderStatusResponse {
  status: LLMProviderStatus;
  provider: string;
  model: string;
  hasApiKey: boolean;
  isAvailable: boolean;
  supportedModels: string[];
  errorMessage?: string;
}

export interface GroundedAnswerRequest {
  query: string;
  chunks: Chunk[];
  model?: string;
  temperature?: number;
}

export interface CitationRef {
  chunkId: string;
  sourceBlockIds: string[];
  headingPath: string[];
  excerpt: string;
}

export interface GroundedAnswerResponse {
  query: string;
  answer: string;
  citations: string[];
  citationRefs: CitationRef[];
  insufficientEvidence: boolean;
  model: string;
  provider: string;
  latencyMs: number;
  promptVersion: string;
}

export type AnswerStreamEventType = 'token' | 'citations' | 'done' | 'error';

export interface AnswerStreamEvent {
  type: AnswerStreamEventType;
  token?: string;
  answer?: string;
  citations?: string[];
  citationRefs?: CitationRef[];
  insufficientEvidence?: boolean;
  model?: string;
  provider?: string;
  latencyMs?: number;
  promptVersion?: string;
  error?: string;
}
// ----------------------------------------------------
// Day 8 Portable RAG Package Models
// ----------------------------------------------------

export interface ManifestFileEntry {
  path: string;
  sha256: string;
  bytes: number;
  recordCount?: number;
}

export interface ChunkerSettingsMetadata {
  recursive?: {
    maxCharacters: number;
    overlapCharacters: number;
  };
  headingAware?: {
    maxCharacters: number;
  };
}

export interface EmbeddingMetadata {
  modelName: string;
  dimension: number;
  metric: 'cosine' | 'dot' | 'euclidean';
  normalized: boolean;
  instructions?: string;
}

export interface GenerationMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  temperature?: number;
}

export interface PackageManifest {
  formatVersion: string;
  createdAt: string;
  sourceIdentity: {
    url: string;
    canonicalUrl?: string;
    title: string;
    mode: CaptureMode;
    captureTime: string;
    extractorVersion: string;
    captureHash: string;
  };
  chunkerSettings: ChunkerSettingsMetadata;
  embeddingMetadata: EmbeddingMetadata;
  generationMetadata?: GenerationMetadata;
  promptVersion?: string;
  licenseNote: string;
  files: ManifestFileEntry[];
}

export interface ExportPackageRequest {
  captureResult: CaptureResult;
  chunks: Chunk[];
  questions?: TestQuestion[];
  retrievalResults?: RetrievalEvaluationResult[];
  answers?: GroundedAnswerResponse[];
  generationMetadata?: GenerationMetadata;
}

export interface PackageValidationIssue {
  severity: 'error' | 'warning';
  file?: string;
  code: string;
  message: string;
}

export interface PackageValidationReport {
  valid: boolean;
  formatVersion?: string;
  totalFiles: number;
  totalBlocks: number;
  totalChunks: number;
  totalQuestions: number;
  totalAnswers: number;
  issues: PackageValidationIssue[];
  manifest?: PackageManifest;
}
