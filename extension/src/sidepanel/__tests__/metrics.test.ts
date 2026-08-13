import { describe, it, expect } from 'vitest';
import { Block } from '../../../../packages/schema';
import { calculateExtractionMetrics } from '../utils/metrics';

describe('calculateExtractionMetrics', () => {
  it('correctly calculates total, included, excluded blocks, characters, and structure breakdown', () => {
    const blocks: Block[] = [
      {
        id: '1',
        type: 'heading',
        content: 'Header',
        headingPath: [],
        sourceAnchor: { blockId: '1', headingPath: [], cssSelector: 'h1', textQuote: { exact: 'Header' } },
        contentHash: 'h1',
        included: true,
      },
      {
        id: '2',
        type: 'paragraph',
        content: 'Para 1',
        headingPath: [],
        sourceAnchor: { blockId: '2', headingPath: [], cssSelector: 'p', textQuote: { exact: 'Para 1' } },
        contentHash: 'h2',
        included: true,
      },
      {
        id: '3',
        type: 'code',
        content: 'code()',
        headingPath: [],
        sourceAnchor: { blockId: '3', headingPath: [], cssSelector: 'pre', textQuote: { exact: 'code()' } },
        contentHash: 'h3',
        included: false,
      },
    ];

    const metrics = calculateExtractionMetrics(blocks);

    expect(metrics.totalBlocks).toBe(3);
    expect(metrics.includedBlocks).toBe(2);
    expect(metrics.excludedBlocks).toBe(1);
    expect(metrics.totalCharacters).toBe(6 + 6); // 'Header' + 'Para 1'
    expect(metrics.structureCounts.heading).toBe(1);
    expect(metrics.structureCounts.paragraph).toBe(1);
    expect(metrics.structureCounts.code).toBe(0); // Excluded block not counted in included structures
  });
});
