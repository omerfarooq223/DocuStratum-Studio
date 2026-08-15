import type {
  Block,
  Chunk,
  HeadingAwareChunkSettings,
  RecursiveChunkSettings,
} from '../../../packages/schema';
import { chunkByHeading } from './heading-aware';
import { chunkRecursively } from './recursive';

export interface ChunkComparisonResult {
  recursive: Chunk[];
  headingAware: Chunk[];
}

export async function chunkBothStrategies(
  blocks: readonly Block[],
  sourceNamespace: string,
  recursiveSettings: RecursiveChunkSettings,
  headingSettings: HeadingAwareChunkSettings,
): Promise<ChunkComparisonResult> {
  const [recursive, headingAware] = await Promise.all([
    chunkRecursively(blocks, sourceNamespace, recursiveSettings),
    chunkByHeading(blocks, sourceNamespace, headingSettings),
  ]);
  return { recursive, headingAware };
}

export { chunkByHeading } from './heading-aware';
export { chunkRecursively } from './recursive';
export { calculateChunkMetrics } from './metrics';
export { createChunkId, MIN_CHUNK_CHARACTERS, MAX_CHUNK_CHARACTERS } from './common';
export { countCharacters, countTokens } from './unicode';

