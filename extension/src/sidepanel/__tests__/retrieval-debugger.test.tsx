import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { RetrievalDebugger } from '../components/RetrievalDebugger';
import { CaptureResult, Chunk } from '../../../../packages/schema';

const mockCaptureResult: CaptureResult = {
  capture: {
    id: 'cap_test_1',
    url: 'https://example.com/test',
    title: 'Test Article',
    mode: 'page',
    timestamp: '2026-08-17T00:00:00.000Z',
    extractorVersion: '1.0.0',
    contentHash: 'hash_123',
  },
  blocks: [
    {
      id: 'blk_001',
      type: 'heading',
      content: 'Overview of WebRAG',
      headingPath: ['Overview'],
      sourceAnchor: {
        blockId: 'blk_001',
        headingPath: ['Overview'],
        cssSelector: 'h1#overview',
        textQuote: { exact: 'Overview of WebRAG' },
      },
      contentHash: 'hash_b1',
      included: true,
    },
    {
      id: 'blk_002',
      type: 'paragraph',
      content: 'WebRAG performs deterministic chunking and local vector retrieval.',
      headingPath: ['Overview'],
      sourceAnchor: {
        blockId: 'blk_002',
        headingPath: ['Overview'],
        cssSelector: 'p#intro',
        textQuote: { exact: 'WebRAG performs deterministic chunking' },
      },
      contentHash: 'hash_b2',
      included: true,
    },
  ],
};

const mockRecursiveChunks: Chunk[] = [
  {
    id: 'chk_rec_1',
    sourceNamespace: 'cap_test_1',
    strategy: 'recursive',
    sequence: 0,
    content: 'WebRAG performs deterministic chunking and local vector retrieval.',
    sourceBlockIds: ['blk_002'],
    sourceSpans: [{ blockId: 'blk_002', startOffset: 0, endOffset: 65, overlapCharacters: 0 }],
    headingPath: ['Overview'],
    tokenCount: 9,
    characterCount: 65,
    contentHash: 'hash_c1',
  },
];

const mockHeadingChunks: Chunk[] = [
  {
    id: 'chk_head_1',
    sourceNamespace: 'cap_test_1',
    strategy: 'heading_aware',
    sequence: 0,
    content: '# Overview of WebRAG\n\nWebRAG performs deterministic chunking and local vector retrieval.',
    sourceBlockIds: ['blk_001', 'blk_002'],
    sourceSpans: [
      { blockId: 'blk_001', startOffset: 0, endOffset: 20, overlapCharacters: 0 },
      { blockId: 'blk_002', startOffset: 22, endOffset: 87, overlapCharacters: 0 },
    ],
    headingPath: ['Overview'],
    tokenCount: 13,
    characterCount: 87,
    contentHash: 'hash_c2',
  },
];

describe('RetrievalDebugger Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders retrieval controls, metrics header, and curated questions', () => {
    render(
      <RetrievalDebugger
        captureResult={mockCaptureResult}
        recursiveChunks={mockRecursiveChunks}
        headingChunks={mockHeadingChunks}
      />
    );

    expect(screen.getByPlaceholderText(/Type query to test retrieval/i)).toBeDefined();
    expect(screen.getByText(/Retrieval Metrics/i)).toBeDefined();
    expect(screen.getByText(/Evaluation Test Questions/i)).toBeDefined();
    expect(screen.getByText(/What is the maximum token count for chunks\?/i)).toBeDefined();
  });

  it('allows switching chunking strategies between recursive and heading_aware', () => {
    render(
      <RetrievalDebugger
        captureResult={mockCaptureResult}
        recursiveChunks={mockRecursiveChunks}
        headingChunks={mockHeadingChunks}
      />
    );

    const chunkerSelect = screen.getByDisplayValue(/Recursive Chunks/i);
    expect(chunkerSelect).toBeDefined();

    fireEvent.change(chunkerSelect, { target: { value: 'heading_aware' } });
    expect(screen.getByDisplayValue(/Heading-Aware/i)).toBeDefined();
  });

  it('executes a query against mocked backend and renders retrieval results', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            chunkId: 'chk_rec_1',
            score: 0.98,
            rank: 1,
            strategy: 'recursive',
            headingPath: ['Overview'],
            excerpt: 'WebRAG performs deterministic chunking and local vector retrieval.',
            sourceBlockIds: ['blk_002'],
          },
        ],
        executionTimeMs: 14.5,
      }),
    });

    render(
      <RetrievalDebugger
        captureResult={mockCaptureResult}
        recursiveChunks={mockRecursiveChunks}
        headingChunks={mockHeadingChunks}
      />
    );

    const input = screen.getByPlaceholderText(/Type query to test retrieval/i);
    fireEvent.change(input, { target: { value: 'deterministic chunking' } });

    const retrieveBtn = screen.getByRole('button', { name: /^Retrieve$/i });
    fireEvent.click(retrieveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Score: 98.0%/i)).toBeDefined();
      expect(screen.getByText(/Source: blk_002/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /Highlight Source/i })).toBeDefined();
    });
  });
});
