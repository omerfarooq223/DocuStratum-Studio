import type { Chunk } from '../../../packages/schema';

export interface ChunkMetrics {
  chunkCount: number;
  minCharacters: number;
  medianCharacters: number;
  maxCharacters: number;
  averageCharacters: number;
  totalCharacters: number;
  overlapCharacters: number;
  continuationParts: number;
  sizeDistribution: number[];
}

export function calculateChunkMetrics(chunks: readonly Chunk[]): ChunkMetrics {
  if (!chunks.length) {
    return {
      chunkCount: 0,
      minCharacters: 0,
      medianCharacters: 0,
      maxCharacters: 0,
      averageCharacters: 0,
      totalCharacters: 0,
      overlapCharacters: 0,
      continuationParts: 0,
      sizeDistribution: [],
    };
  }

  const sizes = chunks.map((chunk) => chunk.characterCount);
  const sorted = [...sizes].sort((left: number, right: number) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return {
    chunkCount: chunks.length,
    minCharacters: sorted[0],
    medianCharacters: median,
    maxCharacters: sorted.at(-1) ?? 0,
    averageCharacters: Math.round(total / chunks.length),
    totalCharacters: total,
    overlapCharacters: chunks.reduce(
      (sum, chunk) => sum + (chunk.overlap?.characterCount ?? 0),
      0,
    ),
    continuationParts: chunks.reduce(
      (sum, chunk) => sum + (chunk.continuations?.length ?? 0),
      0,
    ),
    sizeDistribution: sizes,
  };
}
