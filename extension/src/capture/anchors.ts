import { TEXT_QUOTE_CONTEXT_LENGTH, TEXT_QUOTE_LENGTH } from './constants';
import { normalizeWhitespace, safeNormalizedText } from './dom-safety';
import type { TextQuote } from './types';

function cssEscape(value: string): string {
  const escape = globalThis.CSS?.escape;
  if (escape) return escape(value);
  return value.replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, (match, leadingDigit) => {
    if (leadingDigit) return `\\3${leadingDigit} `;
    return `\\${match}`;
  });
}

function uniqueIdSelector(element: Element): string | undefined {
  if (!element.id) return undefined;
  const selector = `#${cssEscape(element.id)}`;
  try {
    return element.ownerDocument.querySelectorAll(selector).length === 1 ? selector : undefined;
  } catch {
    return undefined;
  }
}

export function createCssSelector(element: Element): string {
  const idSelector = uniqueIdSelector(element);
  if (idSelector) return idSelector;

  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.tagName !== 'HTML') {
    const parent: Element | null = current.parentElement;
    const tag = current.tagName.toLowerCase();
    if (!parent) {
      parts.unshift(tag);
      break;
    }

    const siblings = Array.from(parent.children).filter((sibling) => sibling.tagName === current?.tagName);
    const position = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${position})` : tag);

    const parentId = uniqueIdSelector(parent);
    if (parentId) {
      parts.unshift(parentId);
      break;
    }
    current = parent;
  }
  return parts.join(' > ');
}

export function createNodePath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current) {
    const parent: Element | null = current.parentElement;
    const tag = current.tagName.toLowerCase();
    const sameTag = parent
      ? Array.from(parent.children).filter((sibling) => sibling.tagName === current?.tagName)
      : [current];
    parts.unshift(`${tag}[${sameTag.indexOf(current) + 1}]`);
    current = parent;
  }
  return `/${parts.join('/')}`;
}

export function createTextQuote(element: Element, content: string): TextQuote {
  const normalizedContent = normalizeWhitespace(content);
  const elementText = safeNormalizedText(element);
  const sourceQuote = elementText.includes(normalizedContent) ? normalizedContent : elementText;
  const exact = sourceQuote.slice(0, TEXT_QUOTE_LENGTH);
  const body = element.ownerDocument.body;
  if (!body || !exact) return { exact };

  const corpus = safeNormalizedText(body);
  const index = corpus.indexOf(exact);
  if (index < 0) return { exact };

  const prefix = corpus.slice(Math.max(0, index - TEXT_QUOTE_CONTEXT_LENGTH), index).trim();
  const suffix = corpus
    .slice(index + exact.length, index + exact.length + TEXT_QUOTE_CONTEXT_LENGTH)
    .trim();
  return {
    exact,
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
  };
}
