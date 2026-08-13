import { isExcludedElement, safeNormalizedText } from './dom-safety';

export interface HeadingContext {
  elements: Element[];
  path: string[];
}

export function getHeadingContext(element: Element, limit = Number.POSITIVE_INFINITY): HeadingContext {
  const stack: Array<Element | undefined> = [];
  const headings = Array.from(element.ownerDocument.querySelectorAll('h1, h2, h3, h4, h5, h6'));

  for (const heading of headings) {
    if (heading === element || heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING) {
      break;
    }
    if (isExcludedElement(heading)) continue;
    const level = Number(heading.tagName[1]);
    stack.splice(level - 1);
    stack[level - 1] = heading;
    stack.splice(level);
  }

  const elements = stack.filter((heading): heading is Element => Boolean(heading)).slice(-limit);
  return { elements, path: elements.map((heading) => safeNormalizedText(heading)) };
}

