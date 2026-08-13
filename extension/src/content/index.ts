import { capturePage, captureSelection, ElementPicker } from '../capture';

const environment = { document };
let activePicker: ElementPicker | undefined;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

chrome.runtime.onMessage.addListener((request: { action?: string }, _sender, sendResponse) => {
  if (request.action === 'PING_CONTENT_SCRIPT') {
    sendResponse({ ok: true, status: 'active', url: window.location.href, title: document.title });
    return false;
  }

  if (request.action === 'CAPTURE_SELECTION') {
    void captureSelection(window.getSelection(), environment)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
    return true;
  }

  if (request.action === 'CAPTURE_PAGE') {
    void capturePage(environment)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
    return true;
  }

  if (request.action === 'START_ELEMENT_PICKER') {
    activePicker?.cancel();
    activePicker = new ElementPicker(environment, {
      onCapture: async (result) => {
        activePicker = undefined;
        await chrome.runtime.sendMessage({ type: 'WEBRAG_CAPTURE_COMPLETE', result }).catch(() => undefined);
      },
      onCancel: () => {
        activePicker = undefined;
        void chrome.runtime.sendMessage({ type: 'WEBRAG_PICKER_CANCELLED' }).catch(() => undefined);
      },
      onError: (error) => {
        activePicker = undefined;
        void chrome.runtime
          .sendMessage({ type: 'WEBRAG_CAPTURE_ERROR', error: error.message })
          .catch(() => undefined);
      },
    });
    activePicker.start();
    sendResponse({ ok: true, status: 'armed' });
    return false;
  }

  if (request.action === 'CANCEL_ELEMENT_PICKER') {
    activePicker?.cancel();
    activePicker = undefined;
    sendResponse({ ok: true, status: 'cancelled' });
    return false;
  }

  return false;
});
