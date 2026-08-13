export type CaptureMode = 'selection' | 'element' | 'page';

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

export interface CaptureResult {
  capture: Capture;
  blocks: Block[];
}

export interface CaptureEnvironment {
  document: Document;
  url?: string;
  now?: () => Date;
}

