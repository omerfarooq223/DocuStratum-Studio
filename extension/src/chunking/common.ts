import type {
  Block,
  Chunk,
  ChunkContinuation,
  ChunkSourceSpan,
  ChunkingStrategy,
} from '../../../packages/schema';
import { sha256, stableStringify } from '../capture/hash';
import { countCharacters, countTokens, offsetAfterCharacters } from './unicode';

export const MIN_CHUNK_CHARACTERS = 16;
export const MAX_CHUNK_CHARACTERS = 200_000;

export interface DraftChunk {
  content: string;
  headingPath: string[];
  sourceSpans: ChunkSourceSpan[];
  overlapText?: string;
  continuations?: ChunkContinuation[];
}

export function validateSourceNamespace(sourceNamespace: string): void {
  if (!sourceNamespace.trim()) throw new Error('A non-empty source namespace is required.');
}

export function validateMaxCharacters(maxCharacters: number): void {
  if (!Number.isInteger(maxCharacters)) throw new Error('maxCharacters must be an integer.');
  if (maxCharacters < MIN_CHUNK_CHARACTERS || maxCharacters > MAX_CHUNK_CHARACTERS) {
    throw new Error(
      `maxCharacters must be between ${MIN_CHUNK_CHARACTERS} and ${MAX_CHUNK_CHARACTERS}.`,
    );
  }
}

export function includedContentBlocks(blocks: readonly Block[]): Block[] {
  return blocks.filter((block) => block.included !== false && block.content.length > 0);
}

export function commonHeadingPath(paths: readonly string[][]): string[] {
  if (!paths.length) return [];
  const first = paths[0];
  let length = first.length;
  for (const path of paths.slice(1)) {
    length = Math.min(length, path.length);
    let index = 0;
    while (index < length && first[index] === path[index]) index += 1;
    length = index;
  }
  return first.slice(0, length);
}

export function findBoundaryEnd(
  content: string,
  startOffset: number,
  maxCharacters: number,
  minimumCharacters: number,
  separators: readonly string[],
): number {
  const hardEnd = offsetAfterCharacters(content, startOffset, maxCharacters);
  if (hardEnd >= content.length) return content.length;
  const minimumEnd = offsetAfterCharacters(content, startOffset, minimumCharacters);

  for (const separator of separators) {
    const searchFrom = Math.max(startOffset, hardEnd - separator.length);
    const index = content.lastIndexOf(separator, searchFrom);
    const candidate = index < 0 ? -1 : index + separator.length;
    if (candidate >= minimumEnd && candidate <= hardEnd) return candidate;
  }
  return hardEnd;
}

export async function createChunkId(
  sourceNamespace: string,
  strategy: ChunkingStrategy,
  headingPath: readonly string[],
  sourceBlockIds: readonly string[],
  sequence: number,
  contentHash: string,
): Promise<string> {
  const hash = await sha256(
    stableStringify({
      sourceNamespace,
      strategy,
      headingPath,
      sourceBlockIds,
      sequence,
      contentHash,
    }),
  );
  return `chk_${hash.slice(0, 24)}`;
}

function uniqueBlockIds(spans: readonly ChunkSourceSpan[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const span of spans) {
    if (!seen.has(span.blockId)) {
      seen.add(span.blockId);
      ids.push(span.blockId);
    }
  }
  return ids;
}

export function addContinuationMetadata(
  drafts: DraftChunk[],
  blocks: readonly Block[],
  maxCharacters: number,
): void {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const appearances = new Map<string, number[]>();

  drafts.forEach((draft, draftIndex) => {
    for (const blockId of uniqueBlockIds(draft.sourceSpans)) {
      const indexes = appearances.get(blockId) ?? [];
      indexes.push(draftIndex);
      appearances.set(blockId, indexes);
    }
  });

  for (const [blockId, draftIndexes] of appearances) {
    if (draftIndexes.length < 2) continue;
    const block = blockById.get(blockId);
    if (!block) continue;
    const oversized = countCharacters(block.content) > maxCharacters;

    draftIndexes.forEach((draftIndex, partIndex) => {
      const draft = drafts[draftIndex];
      const span = draft.sourceSpans.find((candidate) => candidate.blockId === blockId);
      const reason = oversized
        ? 'oversized'
        : span && span.overlapCharacters > 0
          ? 'overlap'
          : 'boundary';
      const continuation: ChunkContinuation = {
        sourceBlockId: blockId,
        blockType: block.type,
        part: partIndex + 1,
        totalParts: draftIndexes.length,
        reason,
      };
      draft.continuations = [...(draft.continuations ?? []), continuation];
    });
  }
}

export async function materializeChunks(
  drafts: readonly DraftChunk[],
  sourceNamespace: string,
  strategy: ChunkingStrategy,
): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  for (let sequence = 0; sequence < drafts.length; sequence += 1) {
    const draft = drafts[sequence];
    const sourceBlockIds = uniqueBlockIds(draft.sourceSpans);
    const contentHash = await sha256(draft.content);
    const id = await createChunkId(
      sourceNamespace,
      strategy,
      draft.headingPath,
      sourceBlockIds,
      sequence,
      contentHash,
    );
    const previous = chunks.at(-1);
    const overlap = draft.overlapText && previous
      ? {
          fromChunkId: previous.id,
          fromSequence: previous.sequence,
          characterCount: countCharacters(draft.overlapText),
          contentHash: await sha256(draft.overlapText),
        }
      : undefined;

    chunks.push({
      id,
      sourceNamespace,
      strategy,
      sequence,
      content: draft.content,
      sourceBlockIds,
      sourceSpans: draft.sourceSpans.map((span) => ({ ...span })),
      headingPath: [...draft.headingPath],
      tokenCount: countTokens(draft.content),
      characterCount: countCharacters(draft.content),
      contentHash,
      ...(overlap ? { overlap } : {}),
      ...(draft.continuations?.length
        ? { continuations: draft.continuations.map((continuation) => ({ ...continuation })) }
        : {}),
    });
  }
  return chunks;
}

