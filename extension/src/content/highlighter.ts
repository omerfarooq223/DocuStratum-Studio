import { HighlightTarget, HighlightResponse } from '../../../packages/schema';

const HIGHLIGHT_CONTAINER_ID = 'webrag-debugger-highlight-container';
const HIGHLIGHT_ELEMENT_CLASS = 'webrag-debugger-highlight';
const ACTIVE_TOAST_ID = 'webrag-debugger-toast';

let clearHighlightTimer: ReturnType<typeof setTimeout> | null = null;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Locate target element using CSS selector
 */
function findBySelector(target: HighlightTarget): HTMLElement | null {
  if (!target.cssSelector) return null;
  try {
    const el = document.querySelector(target.cssSelector);
    if (el instanceof HTMLElement) {
      return el;
    }
  } catch (e) {
    console.warn('[WebRAG Highlighter] Invalid selector:', target.cssSelector, e);
  }
  return null;
}

/**
 * Locate target element by text search across DOM text nodes
 */
function findByTextQuote(target: HighlightTarget): HTMLElement | null {
  const exact = normalizeWhitespace(target.textQuote.exact);
  if (!exact || exact.length < 5) return null;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if ((node as HTMLElement).id === HIGHLIGHT_CONTAINER_ID) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let node: Node | null;
  let bestMatch: HTMLElement | null = null;
  let shortestTextLength = Infinity;

  while ((node = walker.nextNode())) {
    const el = node as HTMLElement;
    const text = normalizeWhitespace(el.innerText || el.textContent || '');
    if (text.includes(exact)) {
      if (text.length < shortestTextLength) {
        shortestTextLength = text.length;
        bestMatch = el;
      }
    }
  }

  return bestMatch;
}

/**
 * Injects non-intrusive CSS styles for accessible highlighting
 */
function ensureHighlightStyles(): void {
  const styleId = 'webrag-highlighter-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes webrag-pulse {
      0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
      100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
    }
    .${HIGHLIGHT_ELEMENT_CLASS} {
      outline: 3px solid #2563eb !important;
      outline-offset: 3px !important;
      background-color: rgba(254, 240, 138, 0.55) !important;
      border-radius: 4px !important;
      transition: all 0.25s ease-in-out !important;
      animation: webrag-pulse 2s infinite !important;
      scroll-margin-top: 120px !important;
    }
    #${ACTIVE_TOAST_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: #1e293b;
      color: #f8fafc;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid #334155;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Removes all current highlights
 */
export function removeCurrentHighlights(): void {
  if (clearHighlightTimer) {
    clearTimeout(clearHighlightTimer);
    clearHighlightTimer = null;
  }

  const highlighted = document.querySelectorAll(`.${HIGHLIGHT_ELEMENT_CLASS}`);
  highlighted.forEach((el) => {
    el.classList.remove(HIGHLIGHT_ELEMENT_CLASS);
  });

  const toast = document.getElementById(ACTIVE_TOAST_ID);
  if (toast) toast.remove();
}

/**
 * Highlights target anchor in live DOM or reports stale/missing
 */
export function highlightTargetInDom(target: HighlightTarget): HighlightResponse {
  ensureHighlightStyles();
  removeCurrentHighlights();

  let matchedElement = findBySelector(target);
  let matchMethod = 'selector';

  if (matchedElement) {
    const liveContent = normalizeWhitespace(matchedElement.innerText || matchedElement.textContent || '');
    const expectedContent = normalizeWhitespace(target.textQuote.exact);
    const matchesContent =
      !expectedContent ||
      expectedContent.length < 20 ||
      liveContent.includes(expectedContent.substring(0, 20));

    if (!matchesContent) {
      // Selector matched, but content diverged. Try finding by text quote elsewhere
      const textMatch = findByTextQuote(target);
      if (textMatch) {
        matchedElement = textMatch;
        matchMethod = 'textQuote (relocated)';
      } else {
        return {
          ok: false,
          status: 'stale',
          reason: `Live DOM content diverged from capture. Live snippet: "${liveContent.slice(0, 60)}..."`,
          matchedText: liveContent,
        };
      }
    }
  } else {
    matchedElement = findByTextQuote(target);
    matchMethod = 'textQuote';
  }

  if (!matchedElement) {
    return {
      ok: false,
      status: 'stale',
      reason: 'Element not found in live DOM. Page structure or content may have changed.',
    };
  }

  const liveContent = normalizeWhitespace(matchedElement.innerText || matchedElement.textContent || '');

  matchedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  matchedElement.classList.add(HIGHLIGHT_ELEMENT_CLASS);

  const toast = document.createElement('div');
  toast.id = ACTIVE_TOAST_ID;
  toast.innerHTML = `
    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6;"></span>
    <span>Source Block Highlighted (matched via ${matchMethod})</span>
  `;
  document.body.appendChild(toast);

  clearHighlightTimer = setTimeout(() => {
    removeCurrentHighlights();
  }, 4000);

  return {
    ok: true,
    status: 'highlighted',
    matchedText: liveContent.slice(0, 100),
  };
}
