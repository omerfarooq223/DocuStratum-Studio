import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { highlightTargetInDom, removeCurrentHighlights } from '../highlighter';
import { HighlightTarget } from '../../../../packages/schema';

describe('Content Script Highlighter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    const styleEl = document.getElementById('webrag-highlighter-styles');
    if (styleEl) styleEl.remove();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    removeCurrentHighlights();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('highlights element matched via exact CSS selector and adds toast', () => {
    document.body.innerHTML = `
      <div id="content">
        <h1 id="title">Authentication Reference</h1>
        <p id="p1" class="doc-text">Access tokens must be passed in the Authorization header.</p>
      </div>
    `;

    const target: HighlightTarget = {
      blockId: 'blk_001',
      cssSelector: '#p1',
      textQuote: {
        exact: 'Access tokens must be passed in the Authorization header.',
      },
    };

    const response = highlightTargetInDom(target);
    expect(response.ok).toBe(true);
    expect(response.status).toBe('highlighted');
    expect(response.matchedText).toContain('Access tokens must be passed');

    const highlightedEl = document.getElementById('p1');
    expect(highlightedEl?.classList.contains('webrag-debugger-highlight')).toBe(true);

    const toast = document.getElementById('webrag-debugger-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('Source Block Highlighted');
  });

  it('falls back to textQuote matching when CSS selector has changed or is invalid', () => {
    document.body.innerHTML = `
      <main>
        <h2>OAuth Scopes</h2>
        <p class="description">Scope read:blocks allows extracting semantic page blocks.</p>
      </main>
    `;

    const target: HighlightTarget = {
      blockId: 'blk_002',
      cssSelector: '#invalid-selector-changed',
      textQuote: {
        exact: 'Scope read:blocks allows extracting semantic page blocks.',
      },
    };

    const response = highlightTargetInDom(target);
    expect(response.ok).toBe(true);
    expect(response.status).toBe('highlighted');

    const matchedP = document.querySelector('.description');
    expect(matchedP?.classList.contains('webrag-debugger-highlight')).toBe(true);
  });

  it('returns stale status when live content has diverged from captured text', () => {
    document.body.innerHTML = `
      <div id="section">
        <p id="target-p">Completely modified text that does not match original capture.</p>
      </div>
    `;

    const target: HighlightTarget = {
      blockId: 'blk_003',
      cssSelector: '#target-p',
      textQuote: {
        exact: 'Original captured text that was expected to be here in the document.',
      },
    };

    const response = highlightTargetInDom(target);
    expect(response.ok).toBe(false);
    expect(response.status).toBe('stale');
    expect(response.reason).toContain('Live DOM content diverged');
  });

  it('returns stale status when element cannot be found in DOM', () => {
    document.body.innerHTML = `<div><p>Unrelated page content</p></div>`;

    const target: HighlightTarget = {
      blockId: 'blk_999',
      cssSelector: '#missing-element-id',
      textQuote: {
        exact: 'Nonexistent text that is nowhere in the document',
      },
    };

    const response = highlightTargetInDom(target);
    expect(response.ok).toBe(false);
    expect(response.status).toBe('stale');
    expect(response.reason).toContain('Element not found in live DOM');
  });

  it('auto-cleans highlight and toast after timeout or manual cleanup', () => {
    document.body.innerHTML = `<p id="p-test">Quick highlight test passage</p>`;

    const target: HighlightTarget = {
      blockId: 'blk_004',
      cssSelector: '#p-test',
      textQuote: { exact: 'Quick highlight test passage' },
    };

    highlightTargetInDom(target);
    const el = document.getElementById('p-test');
    expect(el?.classList.contains('webrag-debugger-highlight')).toBe(true);
    expect(document.getElementById('webrag-debugger-toast')).not.toBeNull();

    // Fast-forward timer past 4000ms
    vi.advanceTimersByTime(4500);

    expect(el?.classList.contains('webrag-debugger-highlight')).toBe(false);
    expect(document.getElementById('webrag-debugger-toast')).toBeNull();
  });
});
