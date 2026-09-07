import { describe, expect, it } from 'vitest';
import { captureElement } from '../element';
import { capturePage } from '../page';
import { captureSelection } from '../selection';

const target = 'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest';
const runLive = process.env.WEBRAG_LIVE_TEST === '1';

describe.skipIf(!runLive)('live MDN documentation smoke test', () => {
  it(
    'runs page, selection, and element capture against current public markup',
    async () => {
      const response = await fetch(target, {
        headers: { 'User-Agent': 'WebRAG-Studio-Smoke-Test/0.2' },
      });
      expect(response.ok).toBe(true);
      document.open();
      document.write(await response.text());
      document.close();
      const environment = { document, url: target };

      const firstPage = await capturePage(environment);
      const secondPage = await capturePage(environment);
      expect(firstPage.capture.mode).toBe('page');
      expect(firstPage.blocks).toEqual(secondPage.blocks);
      expect(firstPage.capture.contentHash).toBe(secondPage.capture.contentHash);
      expect(firstPage.blocks[0]?.content).toContain('SubtleCrypto');
      expect(firstPage.blocks.map((block) => block.type)).toEqual(
        expect.arrayContaining(['heading', 'paragraph', 'list', 'code', 'table']),
      );
      expect(JSON.stringify(firstPage)).not.toContain('Search the site');

      const selectionText = Array.from(document.querySelectorAll('main p'))
        .flatMap((paragraph) => Array.from(paragraph.childNodes))
        .find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue?.includes('takes as its arguments'));
      expect(selectionText).toBeTruthy();
      const range = document.createRange();
      range.selectNodeContents(selectionText as Node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const selected = await captureSelection(selection, environment);
      selection?.removeAllRanges();
      expect(selected.capture.mode).toBe('selection');
      expect(selected.blocks.at(-1)?.content).toContain('takes as its arguments');

      const syntaxHeading = document.querySelector('#syntax');
      const syntaxRoot = syntaxHeading?.closest('section') ?? syntaxHeading;
      expect(syntaxRoot).toBeTruthy();
      const element = await captureElement(syntaxRoot as Element, environment);
      expect(element.capture.mode).toBe('element');
      expect(element.blocks.some((block) => block.content.includes('Syntax'))).toBe(true);
      expect(element.blocks.some((block) => block.type === 'code')).toBe(true);
    },
    30_000,
  );
});
