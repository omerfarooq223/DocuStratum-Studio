import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureResult } from '../../../../packages/schema';
import { App } from '../App';
import { clearDraftCapture, saveDraftCapture } from '../utils/storage';

const capture: CaptureResult = {
  capture: {
    id: 'cap_day9_fixture',
    url: 'https://fixture.test/docs',
    canonicalUrl: 'https://fixture.test/docs',
    title: 'Golden Path Smoke Test',
    mode: 'page',
    timestamp: '2026-08-20T10:00:00.000Z',
    extractorVersion: 'webrag-dom/0.2.0',
    contentHash: 'capture_hash',
  },
  blocks: [
    {
      id: 'blk_heading',
      type: 'heading',
      content: 'Authentication',
      headingPath: ['Authentication'],
      sourceAnchor: {
        blockId: 'blk_heading',
        headingPath: ['Authentication'],
        cssSelector: 'h1',
        textQuote: { exact: 'Authentication' },
      },
      contentHash: 'heading_hash',
      included: true,
      attributes: { headingLevel: 1 },
    },
    {
      id: 'blk_expiry',
      type: 'paragraph',
      content: 'Access tokens expire after 3600 seconds.',
      headingPath: ['Authentication'],
      sourceAnchor: {
        blockId: 'blk_expiry',
        headingPath: ['Authentication'],
        cssSelector: '#expiry',
        textQuote: { exact: 'Access tokens expire after 3600 seconds.' },
      },
      contentHash: 'expiry_hash',
      included: true,
    },
  ],
};

describe('Golden-path smoke test', () => {
  beforeEach(async () => {
    await clearDraftCapture();
    await saveDraftCapture(capture);
    global.fetch = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith('/health')
          ? {
              status: 'healthy',
              version: '0.1.0',
              schemaVersion: '1.0.0',
              timestamp: '2026-08-20T10:00:00.000Z',
              requestId: 'smoke-test',
            }
          : {
              apiVersion: '0.1.0',
              schemaVersion: '1.0.0',
              supportedModes: ['selection', 'element', 'page'],
              supportedChunkers: ['recursive', 'heading_aware'],
            },
    }));
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await clearDraftCapture();
  });

  it('restores a capture and reaches review, chunk comparison, retrieval, and export', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('Golden Path Smoke Test')).toBeDefined());
    await waitFor(() => expect(screen.getByText('HEALTHY')).toBeDefined());
    expect(screen.getByText('Access tokens expire after 3600 seconds.')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Compare Chunks/i }));
    await waitFor(() => expect(screen.getAllByText(/Heading-Aware/i).length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: /Semantic Search/i }));
    expect(screen.getByText(/Local Vector Retrieval/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Export/i }));
    expect(screen.getByRole('heading', { name: /Portable RAG Package.*Vendor-Neutral/i })).toBeDefined();
  });
});
