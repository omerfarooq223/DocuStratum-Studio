import type { Block, Chunk, HeadingAwareChunkSettings } from '../../../packages/schema';
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
import { countCharacters } from './unicode';

function blockSeparators(block: Block): readonly string[] {
  switch (block.type) {
    case 'code':
    case 'table':
    case 'list':
      return ['\n', ' '];
    case 'heading':
      return [' '];
    default:
      return ['\n\n', '\n', '. ', ' '];
  }
}

function splitOversizedBlock(block: Block, maxCharacters: number): DraftChunk[] {
  const drafts: DraftChunk[] = [];
  let startOffset = 0;
  while (startOffset < block.content.length) {
    const endOffset = findBoundaryEnd(
      block.content,
      startOffset,
      maxCharacters,
      Math.max(1, Math.floor(maxCharacters * 0.4)),
      blockSeparators(block),
    );
    drafts.push({
      content: block.content.slice(startOffset, endOffset),
      headingPath: [...block.headingPath],
      sourceSpans: [
        {
          blockId: block.id,
          startOffset,
          endOffset,
          overlapCharacters: 0,
        },
      ],
    });
    startOffset = endOffset;
  }
  return drafts;
}

export async function chunkByHeading(
  blocks: readonly Block[],
  sourceNamespace: string,
  settings: HeadingAwareChunkSettings,
): Promise<Chunk[]> {
  validateSourceNamespace(sourceNamespace);
  validateMaxCharacters(settings.maxCharacters);
  const includedBlocks = includedContentBlocks(blocks);
  if (!includedBlocks.length) return [];

  const drafts: DraftChunk[] = [];
  let current: DraftChunk | undefined;
  let currentBlocks: Block[] = [];

  const flush = (): void => {
    if (current) drafts.push(current);
    current = undefined;
    currentBlocks = [];
  };

  for (const block of includedBlocks) {
    if (block.type === 'heading') flush();
    const blockCharacters = countCharacters(block.content);
    if (blockCharacters > settings.maxCharacters) {
      flush();
      drafts.push(...splitOversizedBlock(block, settings.maxCharacters));
      continue;
    }

    const separator = current ? '\n\n' : '';
    const candidateCharacters = current
      ? countCharacters(current.content) + countCharacters(separator) + blockCharacters
      : blockCharacters;
    if (current && candidateCharacters > settings.maxCharacters) flush();

    if (!current) {
      currentBlocks = [block];
      current = {
        content: block.content,
        headingPath: [...block.headingPath],
        sourceSpans: [
          {
            blockId: block.id,
            startOffset: 0,
            endOffset: block.content.length,
            overlapCharacters: 0,
          },
        ],
      };
    } else {
      currentBlocks.push(block);
      current.content += `${separator}${block.content}`;
      current.headingPath = commonHeadingPath(currentBlocks.map((candidate) => candidate.headingPath));
      current.sourceSpans.push({
        blockId: block.id,
        startOffset: 0,
        endOffset: block.content.length,
        overlapCharacters: 0,
      });
    }
  }
  flush();

  addContinuationMetadata(drafts, includedBlocks, settings.maxCharacters);
  return materializeChunks(drafts, sourceNamespace, 'heading_aware');
}

