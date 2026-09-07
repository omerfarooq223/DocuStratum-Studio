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
  } catch (initialErr) {
    // Check if the current tab is a local file:// URL which requires explicit Chrome extension permission
    if (tab.url?.startsWith('file://')) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      } catch {
        throw new Error(
          'Chrome blocks file:// access by default. Please visit the fixture at http://127.0.0.1:8000/demo or enable "Allow access to file URLs" in chrome://extensions -> DocuStratum Studio -> Details.'
        );
      }
    } else {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      } catch (scriptErr) {
        const detail = scriptErr instanceof Error ? scriptErr.message : 'script injection failed';
        throw new Error(`Unable to inject capture script into page (${detail}). Refresh the page and retry.`);
      }
    }

    // Allow content script time to initialize listeners and retry sending message
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((r) => setTimeout(r, 120));
      try {
        return await sendCaptureMessage();
      } catch (retryErr) {
        if (attempt === 2) {
          const detail = retryErr instanceof Error ? retryErr.message : 'connection timed out';
          throw new Error(`Unable to connect to capture engine (${detail}). Refresh the tab and retry.`);
        }
      }
    }
    throw initialErr;
  }
}
