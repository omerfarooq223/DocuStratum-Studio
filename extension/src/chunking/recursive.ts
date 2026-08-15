import type { Block, Chunk, RecursiveChunkSettings } from '../../../packages/schema';
import {
  addContinuationMetadata,
  commonHeadingPath,
  findBoundaryEnd,
  includedContentBlocks,
  materializeChunks,
  type DraftChunk,
  validateMaxCharacters,
  validateSourceNamespace,
} from './common';
import { countCharacters, offsetAfterCharacters, offsetBeforeCharacters } from './unicode';

interface CanonicalBlockSpan {
  block: Block;
  documentStart: number;
  documentEnd: number;
}

interface ChunkInterval {
  start: number;
  end: number;
}

const RECURSIVE_SEPARATORS = ['\n\n', '\n', '. ', ' '] as const;

function buildCanonicalDocument(blocks: readonly Block[]): {
  content: string;
  spans: CanonicalBlockSpan[];
} {
  let content = '';
  const spans: CanonicalBlockSpan[] = [];
  for (const block of blocks) {
    if (content) content += '\n\n';
    const documentStart = content.length;
    content += block.content;
    spans.push({ block, documentStart, documentEnd: content.length });
  }
  return { content, spans };
}

function createIntervals(content: string, settings: RecursiveChunkSettings): ChunkInterval[] {
  const intervals: ChunkInterval[] = [];
  let start = 0;

  while (start < content.length) {
    const minimumCharacters = Math.min(
      settings.maxCharacters - 1,
      Math.max(settings.overlapCharacters + 1, Math.floor(settings.maxCharacters * 0.4)),
    );
    const end = findBoundaryEnd(
      content,
      start,
      settings.maxCharacters,
      minimumCharacters,
      RECURSIVE_SEPARATORS,
    );
    intervals.push({ start, end });
    if (end >= content.length) break;

    const desiredStart = offsetBeforeCharacters(content, end, settings.overlapCharacters);
    start = desiredStart > start ? desiredStart : offsetAfterCharacters(content, start, 1);
  }
  return intervals;
}

function draftsFromIntervals(
  content: string,
  intervals: readonly ChunkInterval[],
  blockSpans: readonly CanonicalBlockSpan[],
): DraftChunk[] {
  return intervals.map((interval, index) => {
    const previousEnd = index > 0 ? intervals[index - 1].end : interval.start;
    const contributing = blockSpans.filter(
      (span) => span.documentStart < interval.end && span.documentEnd > interval.start,
    );
    const sourceSpans = contributing.map((span) => {
      const intersectionStart = Math.max(interval.start, span.documentStart);
      const intersectionEnd = Math.min(interval.end, span.documentEnd);
      const overlapEnd = Math.min(intersectionEnd, previousEnd);
      return {
        blockId: span.block.id,
        startOffset: intersectionStart - span.documentStart,
        endOffset: intersectionEnd - span.documentStart,
        overlapCharacters:
          overlapEnd > intersectionStart
            ? countCharacters(content.slice(intersectionStart, overlapEnd))
            : 0,
      };
    });
    const overlapEnd = Math.min(interval.end, previousEnd);
    const overlapText = overlapEnd > interval.start
      ? content.slice(interval.start, overlapEnd)
      : undefined;
    return {
      content: content.slice(interval.start, interval.end),
      headingPath: commonHeadingPath(contributing.map((span) => span.block.headingPath)),
      sourceSpans,
      ...(overlapText ? { overlapText } : {}),
    };
  });
}

export async function chunkRecursively(
  blocks: readonly Block[],
  sourceNamespace: string,
  settings: RecursiveChunkSettings,
): Promise<Chunk[]> {
  validateSourceNamespace(sourceNamespace);
  validateMaxCharacters(settings.maxCharacters);
  if (!Number.isInteger(settings.overlapCharacters) || settings.overlapCharacters < 0) {
    throw new Error('overlapCharacters must be a non-negative integer.');
  }
  if (settings.overlapCharacters >= settings.maxCharacters) {
    throw new Error('overlapCharacters must be smaller than maxCharacters.');
  }

  const includedBlocks = includedContentBlocks(blocks);
  if (!includedBlocks.length) return [];
  const document = buildCanonicalDocument(includedBlocks);
  const intervals = createIntervals(document.content, settings);
  const drafts = draftsFromIntervals(document.content, intervals, document.spans);
  addContinuationMetadata(drafts, includedBlocks, settings.maxCharacters);
  return materializeChunks(drafts, sourceNamespace, 'recursive');
}

