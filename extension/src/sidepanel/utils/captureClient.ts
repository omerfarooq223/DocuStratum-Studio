import { CaptureMode, CaptureResult } from '../../../../packages/schema';

export class RestrictedTabError extends Error {
  constructor(public url: string) {
    super(`Cannot capture content from restricted browser page: ${url}`);
    this.name = 'RestrictedTabError';
  }
}

export function isRestrictedUrl(url?: string): boolean {
  if (!url) return false;
  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'view-source:',
    'https://chrome.google.com/webstore',
    'https://chromewebstore.google.com',
  ];
  return restrictedPrefixes.some((prefix) => url.startsWith(prefix));
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return null;
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

export async function requestCapture(mode: CaptureMode): Promise<CaptureResult> {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    throw new Error('No active browser tab found to perform capture.');
  }

  if (tab.url && isRestrictedUrl(tab.url)) {
    throw new RestrictedTabError(tab.url);
  }

  const actionMap: Record<CaptureMode, string> = {
    page: 'CAPTURE_PAGE',
    selection: 'CAPTURE_SELECTION',
    element: 'START_ELEMENT_PICKER',
  };

  const action = actionMap[mode];

  const sendCaptureMessage = (): Promise<CaptureResult> => new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id!, { action }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }

      if (!response) {
        return reject(new Error('Received empty response from capture engine.'));
      }

      if (!response.ok) {
        return reject(new Error(response.error || 'Capture request failed.'));
      }

      if (mode === 'element') {
        if (response.result) {
          resolve(response.result as CaptureResult);
        }
      } else {
        resolve(response.result as CaptureResult);
      }
    });
  });

  try {
    return await sendCaptureMessage();
  } catch {
    // Inject only after an explicit user action. This keeps the extension from
    // holding persistent access to every page while preserving the P0 workflow.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      return await sendCaptureMessage();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown browser error';
      throw new Error(`Unable to start capture on this page (${detail}). Refresh the page and retry.`);
    }
  }
}
