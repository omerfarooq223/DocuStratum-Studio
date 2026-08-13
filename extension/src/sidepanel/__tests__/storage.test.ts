import { describe, it, expect, beforeEach } from 'vitest';
import { CaptureResult } from '../../../../packages/schema';
import { saveDraftCapture, loadDraftCapture, clearDraftCapture } from '../utils/storage';

describe('Draft Storage Utility', () => {
  beforeEach(async () => {
    await clearDraftCapture();
  });

  it('saves, loads, and clears draft capture results in localStorage fallback', async () => {
    const dummyResult: CaptureResult = {
      capture: {
        id: 'cap-123',
        url: 'https://docs.webrag.local',
        title: 'Test Docs',
        mode: 'page',
        timestamp: '2026-08-14T00:00:00Z',
        extractorVersion: '1.0.0',
        contentHash: 'hash-cap',
      },
      blocks: [
        {
          id: 'blk-1',
          type: 'heading',
          content: 'Test Heading',
          headingPath: ['Test Heading'],
          sourceAnchor: {
            blockId: 'blk-1',
            headingPath: ['Test Heading'],
            cssSelector: 'h1',
            textQuote: { exact: 'Test Heading' },
          },
          contentHash: 'h-blk-1',
          included: true,
        },
      ],
    };

    // Save
    await saveDraftCapture(dummyResult);

    // Load
    const loaded = await loadDraftCapture();
    expect(loaded).not.toBeNull();
    expect(loaded?.capture.id).toBe('cap-123');
    expect(loaded?.blocks).toHaveLength(1);
    expect(loaded?.blocks[0].content).toBe('Test Heading');

    // Clear
    await clearDraftCapture();
    const afterClear = await loadDraftCapture();
    expect(afterClear).toBeNull();
  });
});
