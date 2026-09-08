import { SourceAnchor } from '../../../../packages/schema';

export interface HighlightResult {
  ok: boolean;
  status: 'highlighted' | 'stale' | 'not_found';
  reason?: string;
  matchedText?: string;
}

/**
 * Universal DOM block highlighter that reliably functions in both Side Panel mode
 * and Full Tab Dashboard mode.
 * 
 * In Full Tab mode, the extension is open in its own tab, so querying the "active tab"
 * returns the extension itself. This function searches for the target web document tab,
 * brings it to the front, ensures content.js is injected, and delivers the highlight event.
 */
export async function highlightSourceBlockInTab(
  sourceAnchor: SourceAnchor,
  sourceUrl?: string
): Promise<HighlightResult> {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    return {
      ok: false,
      status: 'stale',
      reason: 'Browser extension tab messaging is unavailable in this environment.',
    };
  }

  try {
    // 1. Find the target tab
    let targetTab: chrome.tabs.Tab | undefined;

    // First check all open tabs to find one matching sourceUrl (supporting URI encoding differences)
    const allTabs = await chrome.tabs.query({});
    if (sourceUrl) {
      let decodedSource = sourceUrl;
      try {
        decodedSource = decodeURIComponent(sourceUrl);
      } catch {
        // use raw
      }

      targetTab = allTabs.find((t) => {
        if (!t.url) return false;
        if (t.url === sourceUrl || t.url.startsWith(sourceUrl)) return true;
        try {
          const decodedTabUrl = decodeURIComponent(t.url);
          return decodedTabUrl === decodedSource || decodedTabUrl.startsWith(decodedSource);
        } catch {
          return false;
        }
      });
    }

    // If not found by URL, find any non-extension tab in the current window or across windows
    if (!targetTab) {
      const nonExtensionTabs = allTabs.filter(
        (t) => t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://')
      );
      // Prefer active tab if it is not an extension page
      targetTab = nonExtensionTabs.find((t) => t.active) || nonExtensionTabs[0];
    }

    if (!targetTab || !targetTab.id) {
      return {
        ok: false,
        status: 'not_found',
        reason: 'Target webpage tab is no longer open in your browser.',
      };
    }

    const tabId = targetTab.id;

    // 2. Switch focus to the target tab so the user sees the highlighted DOM node
    try {
      await chrome.tabs.update(tabId, { active: true });
      if (targetTab.windowId) {
        await chrome.windows.update(targetTab.windowId, { focused: true });
      }
    } catch {
      // Tab focus is best-effort
    }

    // 3. Helper to send message
    const sendMessage = (): Promise<HighlightResult> =>
      new Promise((resolve) => {
        chrome.tabs.sendMessage(
          tabId,
          { action: 'HIGHLIGHT_SOURCE_BLOCK', target: sourceAnchor },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({
                ok: false,
                status: 'stale',
                reason: chrome.runtime.lastError.message,
              });
            } else if (!response) {
              resolve({
                ok: false,
                status: 'stale',
                reason: 'No response from page highlighter.',
              });
            } else {
              resolve({
                ok: Boolean(response.ok),
                status: response.status || (response.ok ? 'highlighted' : 'stale'),
                reason: response.reason,
                matchedText: response.matchedText,
              });
            }
          }
        );
      });

    // 4. Send highlight message with dynamic content.js re-injection if needed
    let result = await sendMessage();

    if (!result.ok && result.reason && result.reason.includes('Receiving end does not exist')) {
      // Content script was not injected or tab was reloaded; inject now and retry
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });
        // Brief pause for listeners to initialize
        await new Promise((r) => setTimeout(r, 100));
        result = await sendMessage();
      } catch (injectErr: any) {
        return {
          ok: false,
          status: 'stale',
          reason: `Could not reach page content script: ${injectErr?.message || 'injection failed'}`,
        };
      }
    }

    return result;
  } catch (err: any) {
    return {
      ok: false,
      status: 'stale',
      reason: err?.message || 'Failed to highlight source block.',
    };
  }
}
