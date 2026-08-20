import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestCapture } from '../utils/captureClient';

describe('least-privilege capture startup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('injects the capture engine only after the first explicit capture message finds no listener', async () => {
    const result = {
      capture: {
        id: 'cap_1',
        url: 'https://fixture.test/docs',
        title: 'Fixture',
        mode: 'page' as const,
        timestamp: '2026-08-20T10:00:00.000Z',
        extractorVersion: 'webrag-dom/0.2.0',
        contentHash: 'hash',
      },
      blocks: [],
    };
    let attempt = 0;
    const runtime: { lastError?: { message: string } } = {};
    const sendMessage = vi.fn((_tabId: number, _message: unknown, callback: (value?: unknown) => void) => {
      attempt += 1;
      if (attempt === 1) {
        runtime.lastError = { message: 'Receiving end does not exist.' };
        callback(undefined);
        return;
      }
      delete runtime.lastError;
      callback({ ok: true, result });
    });
    const executeScript = vi.fn().mockResolvedValue([]);

    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 7, url: 'https://fixture.test/docs' }]),
        sendMessage,
      },
      scripting: { executeScript },
      runtime,
    });

    await expect(requestCapture('page')).resolves.toEqual(result);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['content.js'],
    });
  });
});
