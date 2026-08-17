import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { GroundedAnswerPanel } from '../components/GroundedAnswerPanel';
import { Chunk, Block } from '../../../../packages/schema';

const mockChunks: Chunk[] = [
  {
    id: 'chk_001',
    sourceNamespace: 'test_ns',
    strategy: 'heading_aware',
    sequence: 0,
    content: 'OAuth access tokens expire after 3600 seconds.',
    sourceBlockIds: ['blk_001'],
    sourceSpans: [{ blockId: 'blk_001', startOffset: 0, endOffset: 46, overlapCharacters: 0 }],
    headingPath: ['Authentication', 'Tokens'],
    tokenCount: 8,
    characterCount: 46,
    contentHash: 'hash_c1',
  },
];

const mockBlocksMap = new Map<string, Block>([
  [
    'blk_001',
    {
      id: 'blk_001',
      type: 'paragraph',
      content: 'OAuth access tokens expire after 3600 seconds.',
      headingPath: ['Authentication', 'Tokens'],
      sourceAnchor: {
        blockId: 'blk_001',
        headingPath: ['Authentication', 'Tokens'],
        cssSelector: 'p#token-expiry',
        textQuote: { exact: 'OAuth access tokens expire after 3600 seconds.' },
      },
      contentHash: 'hash_b1',
      included: true,
    },
  ],
]);

describe('GroundedAnswerPanel Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders provider status and generate button', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/llm/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'configured',
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            hasApiKey: true,
            isAvailable: true,
            supportedModels: ['llama-3.3-70b-versatile'],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <GroundedAnswerPanel
        query="When do tokens expire?"
        chunks={mockChunks}
        blocksMap={mockBlocksMap}
      />
    );

    expect(screen.getByText(/Grounded LLM Answer/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Generate Answer/i })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText(/llama-3.3-70b-versatile/i)).toBeDefined();
    });
  });

  it('handles streaming answer and renders completed answer with citations', async () => {
    const sseChunks = [
      'data: {"type":"token","token":"Tokens"}\n\n',
      'data: {"type":"token","token":" expire after 3600 seconds [chk_001]."}\n\n',
      'data: {"type":"done","answer":"Tokens expire after 3600 seconds [chk_001].","citations":["chk_001"],"citationRefs":[{"chunkId":"chk_001","sourceBlockIds":["blk_001"],"headingPath":["Authentication","Tokens"],"excerpt":"OAuth access tokens expire after 3600 seconds."}],"insufficientEvidence":false,"model":"llama-3.3-70b-versatile","provider":"groq","latencyMs":18.4}\n\n',
    ];

    let chunkIdx = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        if (chunkIdx < sseChunks.length) {
          const chunkStr = sseChunks[chunkIdx++];
          const encoder = new TextEncoder();
          return { done: false, value: encoder.encode(chunkStr) };
        }
        return { done: true, value: undefined };
      }),
    };

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/llm/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'configured',
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            hasApiKey: true,
            isAvailable: true,
            supportedModels: ['llama-3.3-70b-versatile'],
          }),
        };
      }
      if (url.includes('/llm/answer/stream')) {
        return {
          ok: true,
          body: {
            getReader: () => mockReader,
          },
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <GroundedAnswerPanel
        query="When do tokens expire?"
        chunks={mockChunks}
        blocksMap={mockBlocksMap}
      />
    );

    const generateBtn = screen.getByRole('button', { name: /Generate Answer/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Regenerate/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Copy Answer/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Highlight Source/i })).toBeDefined();
    });
  });

  it('renders insufficient context alert when question cannot be answered from context', async () => {
    const sseChunks = [
      'data: {"type":"done","answer":"The provided context does not contain information on alien spaceships.","citations":[],"citationRefs":[],"insufficientEvidence":true,"model":"llama-3.3-70b-versatile","provider":"groq","latencyMs":12.0}\n\n',
    ];

    let chunkIdx = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        if (chunkIdx < sseChunks.length) {
          const chunkStr = sseChunks[chunkIdx++];
          const encoder = new TextEncoder();
          return { done: false, value: encoder.encode(chunkStr) };
        }
        return { done: true, value: undefined };
      }),
    };

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/llm/status')) {
        return {
          ok: true,
          json: async () => ({
            status: 'configured',
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            hasApiKey: true,
            isAvailable: true,
            supportedModels: ['llama-3.3-70b-versatile'],
          }),
        };
      }
      if (url.includes('/llm/answer/stream')) {
        return {
          ok: true,
          body: {
            getReader: () => mockReader,
          },
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <GroundedAnswerPanel
        query="What is the alien spaceship coordinate?"
        chunks={mockChunks}
        blocksMap={mockBlocksMap}
      />
    );

    const generateBtn = screen.getByRole('button', { name: /Generate Answer/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText(/Insufficient Context/i)).toBeDefined();
      expect(screen.getByText(/The model refused to fabricate false information/i)).toBeDefined();
    });
  });

  it('renders unconfigured key notice when API key is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'unconfigured',
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        hasApiKey: false,
        isAvailable: false,
        supportedModels: ['llama-3.3-70b-versatile'],
      }),
    });

    render(
      <GroundedAnswerPanel
        query="Test query"
        chunks={mockChunks}
        blocksMap={mockBlocksMap}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Groq API Key Not Configured/i)).toBeDefined();
      expect(screen.getByText(/GROQ_API_KEY/i)).toBeDefined();
    });
  });
});
