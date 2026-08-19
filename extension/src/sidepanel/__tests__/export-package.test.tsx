import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ExportPackagePanel } from '../components/ExportPackagePanel';
import { CaptureResult, Chunk } from '../../../../packages/schema';

const mockCaptureResult: CaptureResult = {
  capture: {
    id: 'cap_test_export',
    url: 'https://docs.example.com/api',
    title: 'API Reference Guide',
    mode: 'page',
    timestamp: '2026-08-19T10:00:00Z',
    extractorVersion: '1.0.0',
    contentHash: 'hash_api_123',
  },
  blocks: [
    {
      id: 'blk_1',
      type: 'heading',
      content: 'API Reference',
      headingPath: ['API Reference'],
      sourceAnchor: {
        blockId: 'blk_1',
        headingPath: ['API Reference'],
        cssSelector: 'h1',
        textQuote: { exact: 'API Reference' },
      },
      contentHash: 'hash_b1',
      included: true,
    },
    {
      id: 'blk_2',
      type: 'paragraph',
      content: 'All endpoints return JSON responses.',
      headingPath: ['API Reference'],
      sourceAnchor: {
        blockId: 'blk_2',
        headingPath: ['API Reference'],
        cssSelector: 'p',
        textQuote: { exact: 'All endpoints return JSON responses.' },
      },
      contentHash: 'hash_b2',
      included: true,
    },
  ],
};

const mockChunks: Chunk[] = [
  {
    id: 'chk_1',
    sourceNamespace: 'cap_test_export',
    strategy: 'recursive',
    sequence: 0,
    content: 'API Reference\nAll endpoints return JSON responses.',
    sourceBlockIds: ['blk_1', 'blk_2'],
    sourceSpans: [
      { blockId: 'blk_1', startOffset: 0, endOffset: 13, overlapCharacters: 0 },
      { blockId: 'blk_2', startOffset: 14, endOffset: 50, overlapCharacters: 0 },
    ],
    headingPath: ['API Reference'],
    tokenCount: 8,
    characterCount: 50,
    contentHash: 'hash_chk_1',
  },
];

describe('ExportPackagePanel Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders package manifest summary and export button', () => {
    render(
      <ExportPackagePanel
        captureResult={mockCaptureResult}
        chunks={mockChunks}
      />
    );

    expect(screen.getByRole('heading', { name: /Portable RAG Package/i })).toBeDefined();
    expect(screen.getByText(/source\/cleaned.md/i)).toBeDefined();
    expect(screen.getByText(/Vector Omission Guarantee/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Export Portable RAG Package/i })).toBeDefined();
  });

  it('triggers export and displays validation pass card on success', async () => {
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/dummy');
    global.URL.revokeObjectURL = vi.fn();

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/export/package')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'Content-Disposition': 'attachment; filename="webrag-package-test.zip"',
          }),
          blob: async () => new Blob(['dummy-zip-data'], { type: 'application/zip' }),
        };
      }
      if (url.includes('/package/validate')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            valid: true,
            formatVersion: '1.0.0',
            totalFiles: 6,
            totalBlocks: 2,
            totalChunks: 1,
            totalQuestions: 0,
            totalAnswers: 0,
            issues: [],
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    render(
      <ExportPackagePanel
        captureResult={mockCaptureResult}
        chunks={mockChunks}
      />
    );

    const exportBtn = screen.getByText(/Export Portable RAG Package/i);
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText(/Package Passed All Validation Gates/i)).toBeDefined();
    });

    expect(screen.getByText(/webrag-package-test.zip/i)).toBeDefined();
  });
});
