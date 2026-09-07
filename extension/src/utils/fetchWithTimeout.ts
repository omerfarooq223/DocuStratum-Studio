/**
 * Robust fetch utility supporting client-side deadlines/timeouts and companion service auth token forwarding.
 */

let cachedAuthToken: string | null = null;

export async function getAuthToken(): Promise<string | null> {
  if (cachedAuthToken) return cachedAuthToken;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const items = await chrome.storage.local.get(['webrag_auth_token']);
      if (items.webrag_auth_token) {
        cachedAuthToken = items.webrag_auth_token;
        return cachedAuthToken;
      }
    }
  } catch {
    // ignore storage read failure
  }
  return null;
}

export function setCachedAuthToken(token: string | null): void {
  cachedAuthToken = token;
}

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeoutMs = 15000, signal: callerSignal, headers: initHeaders, ...rest } = options;

  const controller = new AbortController();
  let didTimeout = false;

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  // If caller already passed an abort signal, forward abort
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', () => {
        clearTimeout(timer);
        controller.abort();
      });
    }
  }

  const headers = new Headers(initHeaders || {});
  const token = await getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(url, {
      ...rest,
      headers,
      signal: controller.signal,
    });
    return response;
  } catch (err: any) {
    if (didTimeout) {
      const timeoutError = new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      (timeoutError as any).code = 'REQUEST_TIMEOUT';
      (timeoutError as any).status = 408;
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
