import { isExcludedElement, safeNormalizedText } from './dom-safety';
import { getHeadingContext } from './headings';
import { createCaptureMetadata, sourceUrl } from './metadata';
import { normalizeDom } from './normalize';
import type { CaptureEnvironment, CaptureResult } from './types';

function contentDensity(element: Element): number {
  if (isExcludedElement(element)) return Number.NEGATIVE_INFINITY;
  const textLength = safeNormalizedText(element).length;
  if (!textLength) return Number.NEGATIVE_INFINITY;

  const linkLength = Array.from(element.querySelectorAll('a'))
    .filter((anchor) => !isExcludedElement(anchor))
    .reduce((sum, anchor) => sum + safeNormalizedText(anchor).length, 0);
  const linkDensity = Math.min(1, linkLength / textLength);
  const semanticCount = element.querySelectorAll('h1, h2, h3, h4, h5, h6, p, pre, li, table').length;
  const controlCount = element.querySelectorAll('button, input, select, textarea, [role="button"]').length;
  const descendantCount = element.querySelectorAll('*').length;
  const structuralDensityBonus = Math.min(500, (textLength / Math.max(1, descendantCount)) * 2);
  const depth = element.closest('body') ? elementDepth(element) : 0;
  return (
    textLength * (1 - linkDensity) +
    semanticCount * 45 +
    structuralDensityBonus -
    controlCount * 80 -
    depth * 2
  );
}

function elementDepth(element: Element): number {
  let depth = 0;
  for (let current = element.parentElement; current; current = current.parentElement) depth += 1;
  return depth;
}

function bestCandidate(candidates: Element[]): Element | undefined {
  return candidates
    .filter((candidate) => !isExcludedElement(candidate) && safeNormalizedText(candidate).length >= 80)
    .sort((left, right) => contentDensity(right) - contentDensity(left))[0];
}

export function findPageCaptureRoot(document: Document): Element {
  const body = document.body;
  if (!body) throw new Error('This page has no document body to capture.');

  const bodyTextLen = safeNormalizedText(body).length;

  const main = bestCandidate(Array.from(document.querySelectorAll('main, [role="main"]')));
  if (main) {
    const mainTextLen = safeNormalizedText(main).length;
    if (bodyTextLen === 0 || mainTextLen >= bodyTextLen * 0.45) {
      return main;
    }
  }

  const article = bestCandidate(Array.from(document.querySelectorAll('article')));
  if (article) {
    const articleTextLen = safeNormalizedText(article).length;
    if (bodyTextLen === 0 || articleTextLen >= bodyTextLen * 0.45) {
      return article;
    }
  }

  const densityCandidates = [body, ...Array.from(body.querySelectorAll('article, section, div'))]
    .filter((candidate) => candidate.children.length > 0)
    .slice(0, 1_500);
  const best = bestCandidate(densityCandidates);
  if (best && best !== body) {
    const bestTextLen = safeNormalizedText(best).length;
    // Only prefer a sub-container if it represents the vast majority (>= 65%) of the body's safe content
    // Otherwise, we must return body so we don't drop other legitimate sibling sections on portfolios / multi-section pages.
    if (bodyTextLen > 0 && bestTextLen >= bodyTextLen * 0.65) {
      return best;
    }
  }
  return body;
}

export async function capturePage(environment: CaptureEnvironment): Promise<CaptureResult> {
  const root = findPageCaptureRoot(environment.document);
  const blocks = await normalizeDom(root, {
    sourceUrl: sourceUrl(environment),
    initialHeadingPath: getHeadingContext(root).path,
  });
  if (!blocks.length) throw new Error('No safe semantic content was found on this page.');
  return { capture: await createCaptureMetadata('page', blocks, environment), blocks };
}
