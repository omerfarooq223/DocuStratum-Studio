import { createCssSelector, createNodePath, createTextQuote } from './anchors';
import { SEMANTIC_SELECTOR } from './constants';
import { isExcludedElement, normalizeWhitespace, safeNormalizedText, safeText } from './dom-safety';
import { sha256, stableStringify } from './hash';
import type { Block, BlockAttributes, BlockType } from './types';

interface BlockDraft {
  type: BlockType;
  content: string;
  headingPath: string[];
  element: Element;
  attributes?: BlockAttributes;
}

export interface NormalizeOptions {
  sourceUrl: string;
  initialHeadingPath?: string[];
  contentOverrides?: ReadonlyMap<Element, string>;
}

function normalizeCode(value: string): string {
  const lines = value.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n');
  while (lines[0]?.trim() === '') lines.shift();
  while (lines.at(-1)?.trim() === '') lines.pop();

  const nonEmpty = lines.filter((line) => line.trim());
  const indentation = nonEmpty.length
    ? Math.min(...nonEmpty.map((line) => line.match(/^ */)?.[0].length ?? 0))
    : 0;
  return lines.map((line) => line.slice(indentation).replace(/\s+$/g, '')).join('\n');
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function inferCodeLanguage(pre: Element): string | undefined {
  const code = pre.matches('code') ? pre : pre.querySelector(':scope > code');
  const explicit = pre.getAttribute('data-language') ?? code?.getAttribute('data-language');
  if (explicit) return explicit.trim().toLowerCase();

  const classes = `${pre.className} ${code?.className ?? ''}`;
  const match = classes.match(/(?:lang(?:uage)?|highlight-source)-([a-z0-9_+#.-]+)/i);
  return match?.[1]?.toLowerCase();
}

function renderList(list: Element, depth = 0): string[] {
  const ordered = list.tagName === 'OL';
  const lines: string[] = [];
  const items = Array.from(list.children).filter((child) => child.tagName === 'LI');

  items.forEach((item, index) => {
    if (isExcludedElement(item)) return;
    const text = safeNormalizedText(item, (child) => child.tagName === 'UL' || child.tagName === 'OL');
    if (text) {
      const marker = ordered ? `${index + 1}.` : '-';
      lines.push(`${'  '.repeat(depth)}${marker} ${text}`);
    }
    for (const nested of Array.from(item.children)) {
      if (nested.tagName === 'UL' || nested.tagName === 'OL') {
        lines.push(...renderList(nested, depth + 1));
      }
    }
  });
  return lines;
}

function parseTable(table: HTMLTableElement): { headers: string[]; rows: string[][]; content: string } {
  const allRows = Array.from(table.querySelectorAll('tr')).filter(
    (row) => row.closest('table') === table && !isExcludedElement(row),
  );
  const matrix = allRows
    .map((row) =>
      Array.from(row.children)
        .filter((cell) => cell.matches('th, td') && !isExcludedElement(cell))
        .map((cell) => safeNormalizedText(cell)),
    )
    .filter((row) => row.some(Boolean));

  if (!matrix.length) return { headers: [], rows: [], content: '' };
  const firstDomRow = allRows[0];
  const firstIsHeader = Boolean(firstDomRow?.querySelector(':scope > th'));
  const width = Math.max(...matrix.map((row) => row.length));
  const headers = firstIsHeader
    ? [...matrix[0], ...Array(Math.max(0, width - matrix[0].length)).fill('')]
    : Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
  const rows = firstIsHeader ? matrix.slice(1) : matrix;
  const paddedRows = rows.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill('')]);
  const markdown = [
    `| ${headers.map(escapeTableCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...paddedRows.map((row) => `| ${row.map(escapeTableCell).join(' | ')} |`),
  ].join('\n');
  return { headers, rows: paddedRows, content: markdown };
}

function calloutKind(element: Element): string {
  if (element.tagName === 'BLOCKQUOTE') return 'quote';
  const role = element.getAttribute('role');
  if (role === 'alert') return 'warning';
  const marker = `${element.getAttribute('data-callout') ?? ''} ${element.className}`.toLowerCase();
  return ['danger', 'warning', 'important', 'tip', 'note', 'info'].find((kind) => marker.includes(kind)) ?? 'note';
}

export function isSemanticElement(element: Element): boolean {
  if (element.matches('h1, h2, h3, h4, h5, h6, p, pre, ol, ul, table, blockquote')) {
    return true;
  }
  return element.matches(
    'aside[role="note"], [role="alert"], [role="status"], .callout, .admonition, .notice, .warning, .tip, .note',
  );
}

function directTextContainer(element: Element): boolean {
  if (!element.matches('article, aside, div, main, section')) return false;
  if (isSemanticElement(element)) return false;
  if (element.querySelector(SEMANTIC_SELECTOR)) return false;
  return Array.from(element.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && normalizeWhitespace(node.nodeValue ?? ''),
  );
}

function draftForElement(
  element: Element,
  headingStack: string[],
  override?: string,
): BlockDraft | undefined {
  const tag = element.tagName;
  const overridden = override === undefined ? undefined : normalizeWhitespace(override);

  if (/^H[1-6]$/.test(tag)) {
    const content = overridden ?? safeNormalizedText(element);
    if (!content) return undefined;
    const level = Number(tag[1]);
    headingStack.splice(level - 1);
    headingStack[level - 1] = content;
    headingStack.splice(level);
    return {
      type: 'heading',
      content,
      headingPath: headingStack.filter(Boolean),
      element,
      attributes: { headingLevel: level },
    };
  }

  if (tag === 'P' || directTextContainer(element)) {
    const content = overridden ?? safeNormalizedText(element);
    if (!content) return undefined;
    return { type: 'paragraph', content, headingPath: [...headingStack], element };
  }

  if (tag === 'PRE') {
    const codeElement = element.querySelector(':scope > code');
    const content = normalizeCode(override ?? safeText(codeElement ?? element));
    if (!content) return undefined;
    const language = inferCodeLanguage(element);
    return {
      type: 'code',
      content,
      headingPath: [...headingStack],
      element,
      ...(language ? { attributes: { codeLanguage: language } } : {}),
    };
  }

  if (tag === 'UL' || tag === 'OL') {
    const content = renderList(element).join('\n');
    if (!content) return undefined;
    return {
      type: 'list',
      content,
      headingPath: [...headingStack],
      element,
      attributes: { listKind: tag === 'OL' ? 'ordered' : 'unordered' },
    };
  }

  if (tag === 'TABLE') {
    const table = parseTable(element as HTMLTableElement);
    if (!table.content) return undefined;
    return {
      type: 'table',
      content: table.content,
      headingPath: [...headingStack],
      element,
      attributes: { tableHeaders: table.headers, tableRows: table.rows },
    };
  }

  if (isSemanticElement(element)) {
    const content = overridden ?? safeNormalizedText(element);
    if (!content) return undefined;
    return {
      type: 'callout',
      content,
      headingPath: [...headingStack],
      element,
      attributes: { calloutKind: calloutKind(element) },
    };
  }
  return undefined;
}

function collectDrafts(root: Element, headingStack: string[], options: NormalizeOptions): BlockDraft[] {
  const drafts: BlockDraft[] = [];

  const visit = (element: Element): void => {
    if (isExcludedElement(element)) return;
    const draft = draftForElement(element, headingStack, options.contentOverrides?.get(element));
    if (draft) {
      drafts.push(draft);
      return;
    }
    for (const child of Array.from(element.children)) visit(child);
  };

  visit(root);
  return drafts;
}

async function finalizeDrafts(drafts: BlockDraft[], sourceUrl: string): Promise<Block[]> {
  const occurrences = new Map<string, number>();
  return Promise.all(
    drafts.map(async (draft) => {
      const semanticPayload = {
        type: draft.type,
        content: draft.content,
        headingPath: draft.headingPath,
        attributes: draft.attributes,
      };
      const semanticKey = stableStringify(semanticPayload);
      const occurrence = occurrences.get(semanticKey) ?? 0;
      occurrences.set(semanticKey, occurrence + 1);
      const contentHash = await sha256(semanticKey);
      const selector = createCssSelector(draft.element);
      const nodePath = createNodePath(draft.element);
      const idHash = await sha256(
        stableStringify({ sourceUrl, contentHash, occurrence }),
      );
      const id = `blk_${idHash.slice(0, 24)}`;
      return {
        id,
        type: draft.type,
        content: draft.content,
        headingPath: draft.headingPath,
        sourceAnchor: {
          blockId: id,
          headingPath: draft.headingPath,
          cssSelector: selector,
          nodePath,
          textQuote: createTextQuote(draft.element, draft.content),
        },
        contentHash,
        included: true,
        ...(draft.attributes ? { attributes: draft.attributes } : {}),
      } satisfies Block;
    }),
  );
}

export async function normalizeDom(root: Element, options: NormalizeOptions): Promise<Block[]> {
  const stack = [...(options.initialHeadingPath ?? [])];
  return finalizeDrafts(collectDrafts(root, stack, options), options.sourceUrl);
}

export async function normalizeElementList(
  elements: readonly Element[],
  options: NormalizeOptions,
): Promise<Block[]> {
  const stack = [...(options.initialHeadingPath ?? [])];
  const drafts: BlockDraft[] = [];
  for (const element of elements) {
    if (isExcludedElement(element)) continue;
    const draft = draftForElement(element, stack, options.contentOverrides?.get(element));
    if (draft) drafts.push(draft);
  }
  return finalizeDrafts(drafts, options.sourceUrl);
}
