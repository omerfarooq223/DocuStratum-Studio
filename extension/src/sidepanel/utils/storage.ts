import { CaptureResult } from '../../../../packages/schema';

const STORAGE_KEY = 'webrag_latest_draft_capture';
const memoryStorage = new Map<string, string>();

function isChromeStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function isValidCaptureResult(value: unknown): value is CaptureResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CaptureResult>;
  return Boolean(
    candidate.capture &&
      typeof candidate.capture.id === 'string' &&
      typeof candidate.capture.url === 'string' &&
      Array.isArray(candidate.blocks) &&
      candidate.blocks.every(
        (block) =>
          block &&
          typeof block.id === 'string' &&
          typeof block.content === 'string' &&
          block.sourceAnchor?.blockId === block.id,
      ),
  );
}

function getStorageBackend() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const testKey = '__webrag_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch {
      // Fallback to in-memory storage if localStorage is restricted
    }
  }
  return {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, val: string) => memoryStorage.set(key, val),
    removeItem: (key: string) => memoryStorage.delete(key),
  };
}

/**
 * Persists the latest draft capture result locally.
 */
export async function saveDraftCapture(result: CaptureResult): Promise<void> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: result }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[WebRAG Storage] Draft could not be saved locally.');
        }
        resolve();
      });
    });
  }

  try {
    const backend = getStorageBackend();
    backend.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch (e) {
    console.warn('[WebRAG Storage] Failed to write draft capture:', e);
  }
}

/**
 * Loads the latest persisted draft capture result.
 */
export async function loadDraftCapture(): Promise<CaptureResult | null> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (items) => {
        if (chrome.runtime.lastError || !items[STORAGE_KEY]) {
          resolve(null);
        } else {
          const stored = items[STORAGE_KEY];
          resolve(isValidCaptureResult(stored) ? stored : null);
        }
      });
    });
  }

  try {
    const backend = getStorageBackend();
    const raw = backend.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isValidCaptureResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Clears any saved draft capture result.
 */
export async function clearDraftCapture(): Promise<void> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.remove([STORAGE_KEY], () => {
        resolve();
      });
    });
  }

  try {
    const backend = getStorageBackend();
    backend.removeItem(STORAGE_KEY);
  } catch {
    // Ignore clear errors
  }
}
