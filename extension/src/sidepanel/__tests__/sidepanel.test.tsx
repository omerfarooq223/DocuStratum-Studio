import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { BlockTree } from '../components/BlockTree';
import { CleanedMarkdownPreview } from '../components/CleanedMarkdownPreview';
import { Block } from '../../../../packages/schema';

afterEach(cleanup);

describe('SidePanel UI Components', () => {
  const sampleBlocks: Block[] = [
    {
      id: 'blk-1',
      type: 'heading',
      content: 'Overview',
      headingPath: ['Overview'],
      sourceAnchor: {
        blockId: 'blk-1',
        headingPath: ['Overview'],
        cssSelector: 'h1',
        textQuote: { exact: 'Overview' },
      },
      contentHash: 'hash1',
      included: true,
    },
    {
      id: 'blk-2',
      type: 'paragraph',
      content: 'Sample paragraph text.',
      headingPath: ['Overview'],
      sourceAnchor: {
        blockId: 'blk-2',
        headingPath: ['Overview'],
        cssSelector: 'p',
        textQuote: { exact: 'Sample paragraph text.' },
      },
      contentHash: 'hash2',
      included: false,
    },
  ];

  it('renders BlockTree with block items and bulk action controls', () => {
    let toggledId = '';
    let includeAllCalled = false;
    let excludeAllCalled = false;

    render(
      <BlockTree
        blocks={sampleBlocks}
        onToggleBlock={(id) => {
          toggledId = id;
        }}
        onIncludeAll={() => {
          includeAllCalled = true;
        }}
        onExcludeAll={() => {
          excludeAllCalled = true;
        }}
        onRestoreOriginal={() => {}}
      />
    );

    expect(screen.getByText('EXTRACTED BLOCK TREE')).toBeDefined();
    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getByText('Sample paragraph text.')).toBeDefined();

    // Click Include All
    const includeAllBtn = screen.getByText('Include All');
    fireEvent.click(includeAllBtn);
    expect(includeAllCalled).toBe(true);

    // Click Exclude All
    const excludeAllBtn = screen.getByText('Exclude All');
    fireEvent.click(excludeAllBtn);
    expect(excludeAllCalled).toBe(true);

    // Toggle single block
    const toggles = screen.getAllByRole('checkbox');
    fireEvent.click(toggles[0]);
    expect(toggledId).toBe('blk-1');
  });

  it('renders CleanedMarkdownPreview with formatted code box and copy button', () => {
    render(
      <CleanedMarkdownPreview
        markdown="# Overview\n\nSample paragraph text."
        includedCount={2}
        totalCount={2}
      />
    );

    expect(screen.getByText('LIVE CLEANED MARKDOWN')).toBeDefined();
    expect(screen.getByText(/Generated from/)).toBeDefined();
    expect(screen.getByText('📋 Copy Markdown')).toBeDefined();
  });

  it('visibly highlights every source block selected by a chunk', () => {
    let cleared = false;
    render(
      <BlockTree
        blocks={sampleBlocks}
        onToggleBlock={() => undefined}
        onIncludeAll={() => undefined}
        onExcludeAll={() => undefined}
        onRestoreOriginal={() => undefined}
        highlightedBlockIds={new Set(['blk-1', 'blk-2'])}
        onClearHighlight={() => {
          cleared = true;
        }}
      />
    );

    expect(screen.getByRole('status').textContent).toContain('2 source block(s)');
    expect(document.getElementById('source-blk-1')?.classList.contains('highlighted')).toBe(true);
    expect(document.getElementById('source-blk-2')?.classList.contains('highlighted')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(cleared).toBe(true);
  });
});
