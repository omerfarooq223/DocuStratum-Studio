import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetrievalView } from '../components/RetrievalView';

import { SearchResultCard } from '../components/SearchResultCard';
import { Chunk, RetrievalResult } from '../../../../packages/schema';
import * as clientModule from '../../retrieval/client';


const MOCK_CHUNKS: Chunk[] = [
  {
    id: 'chunk-1',
    sourceNamespace: 'test-page',
    strategy: 'heading_aware',
    sequence: 0,
    content: 'The walking skeleton architecture connects the Chrome extension to FastAPI.',
    sourceBlockIds: ['block-1'],
    sourceSpans: [
      {
        blockId: 'block-1',
        startOffset: 0,
        endOffset: 75,
        overlapCharacters: 0
      }
    ],
    headingPath: ['WebRAG', 'Architecture'],
    tokenCount: 11,
    characterCount: 75,
    contentHash: 'hash-1'
  },
  {
    id: 'chunk-2',
    sourceNamespace: 'test-page',
    strategy: 'recursive',
    sequence: 1,
    content: 'Security rules strictly forbid extracting passwords and auth credentials.',
    sourceBlockIds: ['block-2'],
    sourceSpans: [
      {
        blockId: 'block-2',
        startOffset: 0,
        endOffset: 74,
        overlapCharacters: 0
      }
    ],
    headingPath: ['WebRAG', 'Security'],
    tokenCount: 9,
    characterCount: 74,
    contentHash: 'hash-2'
  }
];

const MOCK_RESULT: RetrievalResult = {
  chunkId: 'chunk-1',
  score: 0.8842,
  rank: 1,
  strategy: 'heading_aware',
  headingPath: ['WebRAG', 'Architecture'],
  excerpt: 'The walking skeleton architecture connects the Chrome extension to FastAPI.',
  sourceBlockIds: ['block-1']
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SearchResultCard Component', () => {
  it('renders rank, score percentage, strategy, heading path, and excerpt', () => {
    const onInspectBlock = vi.fn();
    const onInspectChunk = vi.fn();

    render(
      <SearchResultCard
        result={MOCK_RESULT}
        onInspectBlock={onInspectBlock}
        onInspectChunk={onInspectChunk}
      />
    );

    expect(screen.getByText('#1')).toBeDefined();
    expect(screen.getByText(/88%/)).toBeDefined();
    expect(screen.getByText('Heading-Aware')).toBeDefined();
    expect(screen.getByText('WebRAG')).toBeDefined();
    expect(screen.getByText('Architecture')).toBeDefined();
    expect(screen.getByText(/walking skeleton architecture/)).toBeDefined();

    // Inspect block callback
    const blockBtn = screen.getByText('#block-1');
    fireEvent.click(blockBtn);
    expect(onInspectBlock).toHaveBeenCalledWith('block-1');

    // Inspect chunk callback
    const chunkBtn = screen.getByText('Compare Chunk ↗');
    fireEvent.click(chunkBtn);
    expect(onInspectChunk).toHaveBeenCalledWith('chunk-1');
  });
});

describe('RetrievalView Component', () => {
  it('renders search bar, model badge, and allows executing a search query', async () => {

    vi.spyOn(clientModule, 'fetchModelStatus').mockResolvedValue({
      status: 'ready',
      modelName: 'all-MiniLM-L6-v2',
      dimension: 384,
      device: 'cpu',
      cachedEmbeddingsCount: 2,
      isLocal: true
    });

    vi.spyOn(clientModule, 'searchLocalChunks').mockResolvedValue({
      query: 'architecture',
      results: [MOCK_RESULT],
      latencyMs: 14.5,
      model: 'all-MiniLM-L6-v2',
      dimension: 384,
      totalCandidates: 2
    });

    render(
      <RetrievalView
        chunks={MOCK_CHUNKS}
        headingPaths={[['WebRAG', 'Architecture'], ['WebRAG', 'Security']]}
      />
    );

    // Verify model info
    await waitFor(() => {
      expect(screen.getByText(/all-MiniLM-L6-v2/)).toBeDefined();
    });

    // Type query
    const input = screen.getByPlaceholderText(/Search chunks/);
    fireEvent.change(input, { target: { value: 'architecture' } });

    // Submit search
    const submitBtn = screen.getByRole('button', { name: 'Search' });
    fireEvent.click(submitBtn);

    // Results should appear
    await waitFor(() => {
      expect(screen.getByText(/Top 1 results from 2 candidate chunks/)).toBeDefined();
      expect(screen.getByText(/14.5ms local search latency/)).toBeDefined();
      expect(screen.getByText(/walking skeleton architecture/)).toBeDefined();
    });
  });

  it('displays actionable error message when companion service is offline', async () => {
    vi.spyOn(clientModule, 'fetchModelStatus').mockRejectedValue(
      new clientModule.RetrievalServiceError('Cannot connect to local WebRAG companion service')
    );

    vi.spyOn(clientModule, 'searchLocalChunks').mockRejectedValue(
      new clientModule.RetrievalServiceError('Companion service offline at http://127.0.0.1:8000')
    );

    render(
      <RetrievalView
        chunks={MOCK_CHUNKS}
      />
    );

    const input = screen.getByPlaceholderText(/Search chunks/);
    fireEvent.change(input, { target: { value: 'test offline' } });

    const submitBtn = screen.getByRole('button', { name: 'Search' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Retrieval Notice/)).toBeDefined();
      expect(screen.getByText(/Companion service offline/)).toBeDefined();
      expect(screen.getByRole('button', { name: 'Retry Query' })).toBeDefined();
    });
  });
});
