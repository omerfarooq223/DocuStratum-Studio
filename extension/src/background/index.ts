// MV3 Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('[WebRAG Studio] Background service worker initialized.');
});

// Configure side panel behavior on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[WebRAG Studio] Error setting panel behavior:', error));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING_SERVICE_WORKER') {
    sendResponse({ status: 'ok', timestamp: new Date().toISOString() });
  }
  return true;
});
