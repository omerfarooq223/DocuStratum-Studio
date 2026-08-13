import { Block, BlockType } from '../../../../packages/schema';

export interface ExtractionMetrics {
  totalBlocks: number;
  includedBlocks: number;
  excludedBlocks: number;
  totalCharacters: number;
  structureCounts: Record<BlockType, number>;
}

/**
 * Calculates real-time extraction summary metrics for captured blocks.
 */
export function calculateExtractionMetrics(blocks: Block[]): ExtractionMetrics {
  const totalBlocks = blocks.length;
  let includedBlocks = 0;
  let excludedBlocks = 0;
  let totalCharacters = 0;

  const structureCounts: Record<BlockType, number> = {
    heading: 0,
    paragraph: 0,
    list: 0,
    code: 0,
    table: 0,
    callout: 0,
  };

  for (const block of blocks) {
    if (block.included !== false) {
      includedBlocks += 1;
      totalCharacters += block.content.length;
      if (block.type in structureCounts) {
        structureCounts[block.type] += 1;
      }
    } else {
      excludedBlocks += 1;
    }
  }

  return {
    totalBlocks,
    includedBlocks,
    excludedBlocks,
    totalCharacters,
    structureCounts,
  };
}
