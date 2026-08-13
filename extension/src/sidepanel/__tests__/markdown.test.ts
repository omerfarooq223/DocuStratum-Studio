import { describe, it, expect } from 'vitest';
import { Block } from '../../../../packages/schema';
import { generateCleanedMarkdown } from '../utils/markdown';

describe('generateCleanedMarkdown', () => {
  it('converts headings, paragraphs, code, lists, tables, and callouts to structured Markdown', () => {
    const blocks: Block[] = [
      {
        id: 'blk-1',
        type: 'heading',
        content: 'Auth Guide',
        headingPath: ['Auth Guide'],
        sourceAnchor: {
          blockId: 'blk-1',
          headingPath: ['Auth Guide'],
          cssSelector: 'h1',
          textQuote: { exact: 'Auth Guide' },
        },
        contentHash: 'hash1',
        included: true,
        attributes: { headingLevel: 1 },
      },
      {
        id: 'blk-2',
        type: 'paragraph',
        content: 'This guide covers authentication methods.',
        headingPath: ['Auth Guide'],
        sourceAnchor: {
          blockId: 'blk-2',
          headingPath: ['Auth Guide'],
          cssSelector: 'p',
          textQuote: { exact: 'This guide covers authentication methods.' },
        },
        contentHash: 'hash2',
        included: true,
      },
      {
        id: 'blk-3',
        type: 'code',
        content: 'curl -X POST https://api.webrag.local/v1/token',
        headingPath: ['Auth Guide'],
        sourceAnchor: {
          blockId: 'blk-3',
          headingPath: ['Auth Guide'],
          cssSelector: 'pre',
          textQuote: { exact: 'curl -X POST https://api.webrag.local/v1/token' },
        },
        contentHash: 'hash3',
        included: true,
        attributes: { codeLanguage: 'bash' },
      },
      {
        id: 'blk-4',
        type: 'list',
        content: 'Read access\nWrite access',
        headingPath: ['Auth Guide'],
        sourceAnchor: {
          blockId: 'blk-4',
          headingPath: ['Auth Guide'],
          cssSelector: 'ul',
          textQuote: { exact: 'Read access' },
        },
        contentHash: 'hash4',
        included: true,
        attributes: { listKind: 'unordered' },
      },
      {
        id: 'blk-5',
        type: 'table',
        content: 'Field | Type\nToken | String',
        headingPath: ['Auth Guide'],
        sourceAnchor: {
          blockId: 'blk-5',
          headingPath: ['Auth Guide'],
          cssSelector: 'table',
          textQuote: { exact: 'Token' },
        },
        contentHash: 'hash5',
        included: true,
        attributes: {
          tableHeaders: ['Field', 'Type'],
          tableRows: [['access_token', 'string']],
        },
      },
      {
        id: 'blk-6',
        type: 'callout',
        content: 'Keep your API keys secret.',
        headingPath: ['Auth Guide'],
        sourceAnchor: {
          blockId: 'blk-6',
          headingPath: ['Auth Guide'],
          cssSelector: 'div.callout',
          textQuote: { exact: 'Keep your API keys secret.' },
        },
        contentHash: 'hash6',
        included: true,
        attributes: { calloutKind: 'warning' },
      },
    ];

    const markdown = generateCleanedMarkdown(blocks);

    expect(markdown).toContain('# Auth Guide');
    expect(markdown).toContain('This guide covers authentication methods.');
    expect(markdown).toContain('```bash\ncurl -X POST https://api.webrag.local/v1/token\n```');
    expect(markdown).toContain('- Read access\n- Write access');
    expect(markdown).toContain('| Field | Type |');
    expect(markdown).toContain('| access_token | string |');
    expect(markdown).toContain('> [!WARNING]\n> Keep your API keys secret.');
  });

  it('excludes blocks with included === false', () => {
    const blocks: Block[] = [
      {
        id: 'blk-1',
        type: 'paragraph',
        content: 'Visible block',
        headingPath: [],
        sourceAnchor: {
          blockId: 'blk-1',
          headingPath: [],
          cssSelector: 'p',
          textQuote: { exact: 'Visible block' },
        },
        contentHash: 'hash1',
        included: true,
      },
      {
        id: 'blk-2',
        type: 'paragraph',
        content: 'Excluded block content',
        headingPath: [],
        sourceAnchor: {
          blockId: 'blk-2',
          headingPath: [],
          cssSelector: 'p',
          textQuote: { exact: 'Excluded block content' },
        },
        contentHash: 'hash2',
        included: false,
      },
    ];

    const markdown = generateCleanedMarkdown(blocks);
    expect(markdown).toContain('Visible block');
    expect(markdown).not.toContain('Excluded block content');
  });

  it('returns empty string when no blocks are included', () => {
    const blocks: Block[] = [
      {
        id: 'blk-1',
        type: 'paragraph',
        content: 'Test',
        headingPath: [],
        sourceAnchor: {
          blockId: 'blk-1',
          headingPath: [],
          cssSelector: 'p',
          textQuote: { exact: 'Test' },
        },
        contentHash: 'hash1',
        included: false,
      },
    ];

    expect(generateCleanedMarkdown(blocks)).toBe('');
  });
});
