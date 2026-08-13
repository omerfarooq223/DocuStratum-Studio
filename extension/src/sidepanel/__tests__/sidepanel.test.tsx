import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BlockTree } from '../components/BlockTree';
import { CleanedMarkdownPreview } from '../components/CleanedMarkdownPreview';
import { Block } from '../../../../packages/schema';

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
});
