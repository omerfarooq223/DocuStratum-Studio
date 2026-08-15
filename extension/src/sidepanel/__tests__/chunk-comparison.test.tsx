import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '../../../../packages/schema';
import { ChunkComparison } from '../components/ChunkComparison';

const blocks: Block[] = [
  {
    id: 'heading',
    type: 'heading',
    content: 'Guide',
    headingPath: ['Guide'],
    sourceAnchor: {
      blockId: 'heading',
      headingPath: ['Guide'],
      cssSelector: '#guide',
      textQuote: { exact: 'Guide' },
    },
    contentHash: 'heading-hash',
    included: true,
  },
  {
    id: 'paragraph',
    type: 'paragraph',
    content: 'A deterministic paragraph that contributes to both chunking strategies.',
    headingPath: ['Guide'],
    sourceAnchor: {
      blockId: 'paragraph',
      headingPath: ['Guide'],
      cssSelector: '#paragraph',
      textQuote: { exact: 'A deterministic paragraph' },
    },
    contentHash: 'paragraph-hash',
    included: true,
  },
  {
    id: 'section',
    type: 'heading',
    content: 'Reference',
    headingPath: ['Guide', 'Reference'],
    sourceAnchor: {
      blockId: 'section',
      headingPath: ['Guide', 'Reference'],
      cssSelector: '#reference',
      textQuote: { exact: 'Reference' },
    },
    contentHash: 'section-hash',
    included: true,
  },
];

afterEach(cleanup);

describe('ChunkComparison', () => {
  it('shows both strategies, metrics, overlap, and source relationships', async () => {
    render(
      <ChunkComparison
        blocks={blocks}
        sourceNamespace="capture:ui"
        onHighlightBlocks={() => undefined}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Recursive' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Heading-aware' })).toBeDefined();
    expect(screen.getByText(/Recursive makes even overlapping windows/)).toBeDefined();
    expect(screen.getAllByText(/source blocks/).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/Chunk \d+, highlight/).length).toBeGreaterThan(1);
  });

  it('recomputes settings, toggles focus, and reports clicked source blocks', async () => {
    const onHighlight = vi.fn();
    render(
      <ChunkComparison
        blocks={blocks}
        sourceNamespace="capture:ui-actions"
        onHighlightBlocks={onHighlight}
      />,
    );
    await screen.findByRole('heading', { name: 'Recursive' });

    fireEvent.change(screen.getByLabelText('Recursive overlap'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Max characters'), { target: { value: '32' } });
    await waitFor(() => {
      expect(screen.getAllByLabelText(/Chunk \d+, highlight/).length).toBeGreaterThan(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Heading-aware' }));
    expect(screen.queryByRole('heading', { name: 'Recursive' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Heading-aware' })).toBeDefined();

    fireEvent.click(screen.getAllByLabelText(/Chunk \d+, highlight/)[0]);
    expect(onHighlight).toHaveBeenCalledOnce();
    expect(onHighlight.mock.calls[0][0].length).toBeGreaterThan(0);
  });
});
