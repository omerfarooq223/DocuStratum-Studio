// Content script for DOM inspection and capture
console.log('[WebRAG Studio] Content script loaded on page:', window.location.href);

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'PING_CONTENT_SCRIPT') {
    sendResponse({ status: 'active', url: window.location.href, title: document.title });
  }
  return true;
});
