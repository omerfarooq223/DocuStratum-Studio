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

  // Send message to active tab content script
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id!, { action }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(
          new Error(
            `Unable to communicate with tab content script (${chrome.runtime.lastError.message}). Try refreshing the target web page.`
          )
        );
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
}
