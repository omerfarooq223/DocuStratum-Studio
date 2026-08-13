import { SELECTION_HEADING_CONTEXT_LIMIT, SEMANTIC_SELECTOR } from './constants';
import { isExcludedElement, normalizeWhitespace } from './dom-safety';
import { getHeadingContext } from './headings';
import { createCaptureMetadata, sourceUrl } from './metadata';
import { isSemanticElement, normalizeElementList } from './normalize';
import type { CaptureEnvironment, CaptureResult } from './types';

function intersects(range: Range, node: Node): boolean {
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

function selectedTextWithin(element: Element, range: Range, preserveWhitespace = false): string {
  const document = element.ownerDocument;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement && !isExcludedElement(node.parentElement) && intersects(range, node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const pieces: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue ?? '';
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : value.length;
    pieces.push(value.slice(start, end));
  }
  const selected = pieces.join(preserveWhitespace ? '' : ' ');
  return preserveWhitespace ? selected : normalizeWhitespace(selected);
}

function semanticElementsForRange(range: Range, document: Document): Element[] {
  const candidates = Array.from(document.querySelectorAll(SEMANTIC_SELECTOR)).filter(
    (element) => intersects(range, element) && !isExcludedElement(element),
  );
  return candidates.filter(
    (element) => !candidates.some((other) => other !== element && other.contains(element) && isSemanticElement(other)),
  );
}

export async function captureSelection(
  selection: Selection | null,
  environment: CaptureEnvironment,
): Promise<CaptureResult> {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    throw new Error('Select some page content before starting selection capture.');
  }
  const range = selection.getRangeAt(0);
  if (range.startContainer.ownerDocument !== environment.document) {
    throw new Error('The selection does not belong to the active document.');
  }

  const selectedElements = semanticElementsForRange(range, environment.document);
  if (!selectedElements.length) throw new Error('The selection contains no safe semantic content.');

  const context = getHeadingContext(selectedElements[0], SELECTION_HEADING_CONTEXT_LIMIT);
  const selectedSet = new Set(selectedElements);
  const elements = [...context.elements.filter((heading) => !selectedSet.has(heading)), ...selectedElements];
  const overrides = new Map<Element, string>();
  for (const element of selectedElements) {
    if (element.matches('p, h1, h2, h3, h4, h5, h6, pre, blockquote, [role="note"], [role="alert"]')) {
      const text = selectedTextWithin(element, range, element.tagName === 'PRE');
      if (text) overrides.set(element, text);
    }
  }

  const blocks = await normalizeElementList(elements, {
    sourceUrl: sourceUrl(environment),
    contentOverrides: overrides,
  });
  if (!blocks.length) throw new Error('The selection contains no safe semantic content.');
  return { capture: await createCaptureMetadata('selection', blocks, environment), blocks };
}
