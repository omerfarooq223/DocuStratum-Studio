import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureElement, ElementPicker } from '../element';
import { safeNormalizedText } from '../dom-safety';
import { capturePage, findPageCaptureRoot } from '../page';
import { captureSelection } from '../selection';
import type { Block, CaptureEnvironment } from '../types';

const fixtureHtml = readFileSync(
  resolve(process.cwd(), 'src/capture/__tests__/fixtures/golden-page.html'),
  'utf8',
);
const golden = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/capture/__tests__/fixtures/golden-page.blocks.json'), 'utf8'),
) as unknown[];
const pageUrl = 'https://fixture.test/docs/source?version=2#fragment';

function loadFixture(): CaptureEnvironment {
  document.open();
  document.write(fixtureHtml);
  document.close();
  return { document, url: pageUrl, now: () => new Date('2026-08-13T10:00:00.000Z') };
}

function goldenProjection(block: Block): object {
  return {
    type: block.type,
    content: block.content,
    headingPath: block.headingPath,
    ...(block.attributes ? { attributes: block.attributes } : {}),
  };
}

beforeEach(() => {
  loadFixture();
});

describe('page capture golden fixture', () => {
  it('normalizes every supported block and preserves structural attributes', async () => {
    const result = await capturePage(loadFixture());
    expect(result.blocks.map(goldenProjection)).toEqual(golden);
    expect(new Set(result.blocks.map((block) => block.type))).toEqual(
      new Set(['heading', 'paragraph', 'list', 'code', 'table', 'callout']),
    );
  });

  it('excludes sensitive values, controls, hidden content, navigation, and scripts', async () => {
    const result = await capturePage(loadFixture());
    const serialized = JSON.stringify(result);
    for (const secret of [
      'SCRIPT_SECRET',
      'NAVIGATION_SECRET',
      'FORM_HEADING_SECRET',
      'FORM_VALUE_SECRET',
      'PASSWORD_SECRET',
      'CONTROL_SECRET',
      'EDITABLE_SECRET',
      'HIDDEN_ATTRIBUTE_SECRET',
      'ARIA_HIDDEN_SECRET',
      'DISPLAY_NONE_SECRET',
      'EXPLICIT_EXCLUSION_SECRET',
      'FOOTER_SECRET',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('produces identical normalized blocks, IDs, anchors, and hashes on recapture', async () => {
    const environment = loadFixture();
    const first = await capturePage(environment);
    const second = await capturePage(environment);
    expect(second.blocks).toEqual(first.blocks);
    expect(second.capture.id).toBe(first.capture.id);
    expect(second.capture.contentHash).toBe(first.capture.contentHash);
    for (const block of first.blocks) {
      expect(block.sourceAnchor.blockId).toBe(block.id);
      expect(block.sourceAnchor.cssSelector).not.toBe('');
      expect(block.sourceAnchor.headingPath).toEqual(block.headingPath);
      expect(block.sourceAnchor.textQuote.exact).not.toBe('');
      const source = document.querySelector(block.sourceAnchor.cssSelector);
      expect(source).toBeTruthy();
      expect(safeNormalizedText(source as Element)).toContain(block.sourceAnchor.textQuote.exact);
      expect(block.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('keeps semantic block IDs stable when an unrelated wrapper changes the DOM path', async () => {
    const environment = loadFixture();
    const first = await capturePage(environment);
    const intro = document.querySelector('#intro') as Element;
    const wrapper = document.createElement('div');
    intro.replaceWith(wrapper);
    wrapper.append(intro);
    const second = await capturePage(environment);
    expect(second.blocks.map(({ id }) => id)).toEqual(first.blocks.map(({ id }) => id));
    expect(second.capture.contentHash).toBe(first.capture.contentHash);
  });

  it('records complete capture metadata and resolves a relative canonical URL', async () => {
    const { capture } = await capturePage(loadFixture());
    expect(capture).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^cap_[a-f0-9]{24}$/),
        url: 'https://fixture.test/docs/source?version=2',
        canonicalUrl: 'https://fixture.test/docs/golden',
        title: 'WebRAG Golden Documentation',
        mode: 'page',
        timestamp: '2026-08-13T10:00:00.000Z',
        extractorVersion: 'webrag-dom/0.2.0',
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });
});

describe('all three capture modes', () => {
  it('captures only selected text plus a small heading context', async () => {
    const environment = loadFixture();
    const strong = document.querySelector('#intro strong')?.firstChild;
    expect(strong).toBeTruthy();
    const range = document.createRange();
    range.setStart(strong as Node, 0);
    range.setEnd(strong as Node, strong?.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const result = await captureSelection(selection, environment);
    expect(result.capture.mode).toBe('selection');
    expect(result.blocks.map(({ type, content }) => ({ type, content }))).toEqual([
      { type: 'heading', content: 'WebRAG Capture Guide' },
      { type: 'paragraph', content: 'deterministic tokens' },
    ]);
  });

  it('captures a chosen element with the correct heading hierarchy', async () => {
    const environment = loadFixture();
    const reference = document.querySelector('#reference');
    expect(reference).toBeTruthy();
    const result = await captureElement(reference as Element, environment);
    expect(result.capture.mode).toBe('element');
    expect(result.blocks[0].content).toBe('Reference');
    expect(result.blocks[0].headingPath).toEqual(['WebRAG Capture Guide', 'Reference']);
    expect(result.blocks.at(-1)?.content).toContain('alpha');
  });

  it('uses main, then article, then density as page root fallbacks', () => {
    loadFixture();
    expect(findPageCaptureRoot(document).id).toBe('content');

    document.body.innerHTML = '<article id="article"><h1>Article</h1><p>' + 'content '.repeat(20) + '</p></article>';
    expect(findPageCaptureRoot(document).id).toBe('article');

    document.body.innerHTML = `
      <div class="toolbar">Ignored controls</div>
      <div id="dense"><p>${'documentation '.repeat(60)}</p></div>
      <div><a href="#">link link link link link</a></div>`;
    expect(findPageCaptureRoot(document).id).toBe('dense');
  });
});

describe('element picker lifecycle', () => {
  it('outlines on hover, captures on click, then removes styles and listeners', async () => {
    const environment = loadFixture();
    const onCapture = vi.fn();
    const picker = new ElementPicker(environment, { onCapture });
    const intro = document.querySelector('#intro') as Element;
    picker.start();
    intro.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(Array.from(intro.attributes).some((attribute) => attribute.name.startsWith('data-webrag-picker-'))).toBe(true);

    intro.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(onCapture).toHaveBeenCalledOnce());
    expect(picker.isActive()).toBe(false);
    expect(Array.from(intro.attributes).some((attribute) => attribute.name.startsWith('data-webrag-picker-'))).toBe(false);
    expect(document.querySelector('style[data-webrag-picker-style]')).toBeNull();
  });

  it('cancels on Escape and performs cleanup', () => {
    const environment = loadFixture();
    const onCancel = vi.fn();
    const picker = new ElementPicker(environment, { onCapture: vi.fn(), onCancel });
    picker.start();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(picker.isActive()).toBe(false);
  });
});
