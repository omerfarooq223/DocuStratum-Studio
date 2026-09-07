import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout, setCachedAuthToken } from '../../utils/fetchWithTimeout';
import { searchLocalChunks } from '../../retrieval/client';

describe('fetchWithTimeout and client request deadlines', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setCachedAuthToken(null);
  });

  it('times out and throws error with REQUEST_TIMEOUT code when request exceeds deadline', async () => {
    // Mock global fetch to hang indefinitely
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }));

    await expect(fetchWithTimeout('http://127.0.0.1:8000/health', { timeoutMs: 50 })).rejects.toThrow(
      /Request timed out after 50ms/
    );
  });

  it('attaches bearer token authorization header when token is configured', async () => {
    setCachedAuthToken('test-secret-token-xyz');

    let interceptedHeaders: Headers | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init) => {
      interceptedHeaders = init?.headers as Headers;
      return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    }));

    const resp = await fetchWithTimeout('http://127.0.0.1:8000/model/status', { timeoutMs: 1000 });
    expect(resp.status).toBe(200);
    expect(interceptedHeaders?.get('Authorization')).toBe('Bearer test-secret-token-xyz');
  });

  it('searchLocalChunks times out gracefully and surfaces REQUEST_TIMEOUT code', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }));

    const dummyChunk = {
      id: 'c1',
      sourceNamespace: 'test',
      strategy: 'heading_aware' as const,
      sequence: 0,
      content: 'test content',
      sourceBlockIds: ['b1'],
      sourceSpans: [],
      headingPath: [],
      tokenCount: 2,
      characterCount: 12,
      contentHash: 'hash1',
    };

    await expect(
      searchLocalChunks('query', [dummyChunk], { timeoutMs: 40 })
    ).rejects.toMatchObject({
      name: 'RetrievalServiceError',
      code: 'REQUEST_TIMEOUT',
      status: 408,
    });
  });
});
