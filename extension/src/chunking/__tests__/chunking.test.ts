import { describe, expect, it } from 'vitest';
import type { Block, BlockType, Chunk } from '../../../../packages/schema';
import { sha256 } from '../../capture/hash';
import { chunkBothStrategies, chunkByHeading, chunkRecursively } from '..';
import { offsetAfterCharacters } from '../unicode';

function makeBlock(
  id: string,
  type: BlockType,
  content: string,
  headingPath: string[] = [],
  included = true,
): Block {
  return {
    id,
    type,
    content,
    headingPath,
    sourceAnchor: {
      blockId: id,
      headingPath,
      cssSelector: `#${id}`,
      textQuote: { exact: content.slice(0, 40) },
    },
    contentHash: `hash-${id}`,
    included,
  };
}

function canonicalContent(blocks: readonly Block[]): string {
  return blocks
    .filter((block) => block.included !== false && block.content.length > 0)
    .map((block) => block.content)
    .join('\n\n');
}

function reconstructRecursive(chunks: readonly Chunk[]): string {
  return chunks.map((chunk, index) => {
    if (index === 0 || !chunk.overlap) return chunk.content;
    const offset = offsetAfterCharacters(chunk.content, 0, chunk.overlap.characterCount);
    return chunk.content.slice(offset);
  }).join('');
}

function reconstructBlock(chunks: readonly Chunk[], block: Block): string {
  return chunks
    .flatMap((chunk) =>
      chunk.sourceSpans
        .filter((span) => span.blockId === block.id)
        .map((span) => block.content.slice(span.startOffset, span.endOffset)),
    )
    .join('');
}

describe('recursive chunking', () => {
  it('uses configurable maximum and exact declared overlap without losing content', async () => {
    const blocks = [
      makeBlock('b1', 'paragraph', 'Alpha beta gamma delta epsilon zeta eta theta.', ['Guide']),
      makeBlock('b2', 'paragraph', 'Second paragraph keeps the canonical separator.', ['Guide']),
    ];
    const chunks = await chunkRecursively(blocks, 'capture:recursive', {
      maxCharacters: 32,
      overlapCharacters: 7,
    });

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.characterCount <= 32)).toBe(true);
    expect(reconstructRecursive(chunks)).toBe(canonicalContent(blocks));
    for (let index = 1; index < chunks.length; index += 1) {
      const overlap = chunks[index].overlap;
      expect(overlap).toBeDefined();
      const count = overlap?.characterCount ?? 0;
      const previousSuffix = Array.from(chunks[index - 1].content).slice(-count).join('');
      const currentPrefix = Array.from(chunks[index].content).slice(0, count).join('');
      expect(currentPrefix).toBe(previousSuffix);
      expect(overlap?.contentHash).toBe(await sha256(currentPrefix));
    }
  });

  it('keeps an exact-size input in one chunk', async () => {
    const content = 'x'.repeat(32);
    const chunks = await chunkRecursively(
      [makeBlock('exact', 'paragraph', content)],
      'capture:exact',
      { maxCharacters: 32, overlapCharacters: 8 },
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(content);
    expect(chunks[0].characterCount).toBe(32);
  });

  it('does not split unicode surrogate pairs and reconstructs byte-equivalent text', async () => {
    const content = '🧠 café 東京 — deterministic retrieval '.repeat(4).trim();
    const chunks = await chunkRecursively(
      [makeBlock('unicode', 'paragraph', content)],
      'capture:unicode',
      { maxCharacters: 24, overlapCharacters: 5 },
    );
    expect(chunks.every((chunk) => !chunk.content.includes('\uFFFD'))).toBe(true);
    expect(reconstructRecursive(chunks)).toBe(content);
  });

  it('labels code and table structures whenever recursive boundaries continue them', async () => {
    const blocks = [
      makeBlock('recursive-code', 'code', 'const value = 1;\n'.repeat(8), ['Examples']),
      makeBlock('recursive-table', 'table', '| a | b |\n'.repeat(8), ['Reference']),
    ];
    const chunks = await chunkRecursively(blocks, 'capture:recursive-structures', {
      maxCharacters: 32,
      overlapCharacters: 4,
    });
    const continuations = chunks.flatMap((chunk) => chunk.continuations ?? []);
    expect(continuations.some((item) => item.sourceBlockId === 'recursive-code' && item.blockType === 'code')).toBe(true);
    expect(continuations.some((item) => item.sourceBlockId === 'recursive-table' && item.blockType === 'table')).toBe(true);
    expect(reconstructRecursive(chunks)).toBe(canonicalContent(blocks));
  });
});

describe('heading-aware chunking', () => {
  it('starts sections at headings and keeps normal structural blocks intact', async () => {
    const blocks = [
      makeBlock('h1', 'heading', 'Guide', ['Guide']),
      makeBlock('p1', 'paragraph', 'Overview paragraph.', ['Guide']),
      makeBlock('h2', 'heading', 'Install', ['Guide', 'Install']),
      makeBlock('l1', 'list', '- First\n- Second', ['Guide', 'Install']),
    ];
    const chunks = await chunkByHeading(blocks, 'capture:headings', { maxCharacters: 64 });

    expect(chunks).toHaveLength(2);
    expect(chunks[0].sourceBlockIds).toEqual(['h1', 'p1']);
    expect(chunks[0].headingPath).toEqual(['Guide']);
    expect(chunks[1].sourceBlockIds).toEqual(['h2', 'l1']);
    expect(chunks[1].headingPath).toEqual(['Guide', 'Install']);
    expect(chunks.every((chunk) => chunk.overlap === undefined)).toBe(true);
  });

  it('splits oversized code at safe boundaries with explicit continuation metadata', async () => {
    const code = [
      'const alpha = 1;',
      'const beta = 2;',
      'const gamma = alpha + beta;',
      'console.log(gamma);',
    ].join('\n');
    const block = makeBlock('code', 'code', code, ['Guide', 'Example']);
    const chunks = await chunkByHeading([block], 'capture:code', { maxCharacters: 32 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.characterCount <= 32)).toBe(true);
    expect(chunks.every((chunk) => chunk.continuations?.[0].blockType === 'code')).toBe(true);
    expect(chunks.map((chunk) => chunk.continuations?.[0].part)).toEqual(
      Array.from({ length: chunks.length }, (_, index) => index + 1),
    );
    expect(chunks.every((chunk) => chunk.continuations?.[0].totalParts === chunks.length)).toBe(true);
    expect(reconstructBlock(chunks, block)).toBe(code);
  });

  it('splits oversized tables by rows without truncating or repeating headers', async () => {
    const table = [
      '| Name | Value |',
      '| --- | --- |',
      '| alpha | one |',
      '| beta | two |',
      '| gamma | three |',
    ].join('\n');
    const block = makeBlock('table', 'table', table, ['Reference']);
    const chunks = await chunkByHeading([block], 'capture:table', { maxCharacters: 32 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.continuations?.[0].blockType === 'table')).toBe(true);
    expect(reconstructBlock(chunks, block)).toBe(table);
    expect(chunks.map((chunk) => chunk.content).join('').match(/\| Name \| Value \|/g)).toHaveLength(1);
  });

  it('splits oversized lists at item lines and preserves every character once', async () => {
    const list = '- Alpha item\n- Beta item\n- Gamma item\n- Delta item';
    const block = makeBlock('list', 'list', list, ['Guide']);
    const chunks = await chunkByHeading([block], 'capture:list', { maxCharacters: 24 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(reconstructBlock(chunks, block)).toBe(list);
    expect(chunks.every((chunk) => chunk.continuations?.[0].blockType === 'list')).toBe(true);
  });

  it('handles a single oversized line with hard unicode-safe boundaries', async () => {
    const content = '🧩'.repeat(40);
    const block = makeBlock('single-line', 'code', content, ['Example']);
    const chunks = await chunkByHeading([block], 'capture:single-line', { maxCharacters: 16 });
    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.characterCount)).toEqual([16, 16, 8]);
    expect(reconstructBlock(chunks, block)).toBe(content);
  });
});

describe('deterministic contracts and boundaries', () => {
  const boundaryBlocks = [
    makeBlock('h1', 'heading', 'Determinism', ['Determinism']),
    makeBlock('p1', 'paragraph', 'The same reviewed blocks always make the same chunks.', ['Determinism']),
    makeBlock('list', 'list', '- Stable order\n- Stable hashes', ['Determinism']),
  ];

  it('returns no chunks for empty or entirely excluded input', async () => {
    expect(await chunkRecursively([], 'capture:empty', { maxCharacters: 32, overlapCharacters: 4 })).toEqual([]);
    expect(
      await chunkByHeading(
        [makeBlock('empty', 'paragraph', ''), makeBlock('off', 'paragraph', 'hidden', [], false)],
        'capture:excluded',
        { maxCharacters: 32 },
      ),
    ).toEqual([]);
  });

  it('produces byte-identical chunks and IDs across ten runs', async () => {
    const runs = await Promise.all(
      Array.from({ length: 10 }, () =>
        chunkBothStrategies(
          boundaryBlocks,
          'capture:ten-runs',
          { maxCharacters: 40, overlapCharacters: 8 },
          { maxCharacters: 40 },
        ),
      ),
    );
    const baseline = JSON.stringify(runs[0]);
    expect(runs.every((run) => JSON.stringify(run) === baseline)).toBe(true);
    expect(runs[0].recursive.every((chunk) => /^chk_[a-f0-9]{24}$/.test(chunk.id))).toBe(true);
    expect(runs[0].headingAware.every((chunk) => /^chk_[a-f0-9]{24}$/.test(chunk.id))).toBe(true);
  });

  it('uses namespace and strategy in IDs while retaining the same content hash', async () => {
    const recursiveA = await chunkRecursively(boundaryBlocks, 'namespace:a', {
      maxCharacters: 200,
      overlapCharacters: 0,
    });
    const recursiveB = await chunkRecursively(boundaryBlocks, 'namespace:b', {
      maxCharacters: 200,
      overlapCharacters: 0,
    });
    const heading = await chunkByHeading(boundaryBlocks, 'namespace:a', { maxCharacters: 200 });
    expect(recursiveA[0].contentHash).toBe(recursiveB[0].contentHash);
    expect(recursiveA[0].id).not.toBe(recursiveB[0].id);
    expect(recursiveA[0].id).not.toBe(heading[0].id);
  });

  it('rejects invalid maxima and overlap settings', async () => {
    await expect(
      chunkRecursively(boundaryBlocks, 'capture:invalid', {
        maxCharacters: 16,
        overlapCharacters: 16,
      }),
    ).rejects.toThrow('smaller');
    await expect(
      chunkByHeading(boundaryBlocks, 'capture:invalid', { maxCharacters: 15 }),
    ).rejects.toThrow('between');
  });
});
