import React from 'react';

interface EmptyStateProps {
  onStartCapture: (mode: 'page' | 'selection' | 'element') => void;
  onLoadDemo?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onStartCapture, onLoadDemo }) => {
  return (
    <div className="status-view empty-view">
      <div className="status-icon">🌐</div>
      <h3>No Capture Active</h3>
      <p>
        Extract clean, structured content from any web page or documentation to inspect semantic
        blocks, review Markdown, compare chunking strategies, and run local RAG queries.
      </p>
      <div className="empty-actions">
        <button className="btn btn-primary" onClick={() => onStartCapture('page')}>
          📄 Capture Full Page
        </button>
        <button className="btn btn-secondary" onClick={() => onStartCapture('element')}>
          🎯 Element Picker
        </button>
        {onLoadDemo && (
          <button className="btn btn-demo" onClick={onLoadDemo} title="Load sample documentation fixture to preview all features">
            ⚡ Load Sample Docs
          </button>
        )}
      </div>
    </div>
  );
};

interface RestrictedPageStateProps {
  url: string;
}

export const RestrictedPageState: React.FC<RestrictedPageStateProps> = ({ url }) => {
  return (
    <div className="status-view restricted-view">
      <div className="status-icon">🛡️</div>
      <h3>Restricted Browser Page</h3>
      <p>
        Chrome Extension security policy prevents content script injection on browser internal pages
        (e.g., <code>chrome://</code>, extension pages, or the Chrome Web Store).
      </p>
      <div className="restricted-details">
        <span>Current URL:</span>
        <code>{url}</code>
      </div>
      <p className="status-hint">
        💡 <strong>To test WebRAG Studio:</strong> Navigate to any standard documentation page or open
        the local fixture page at <code>fixtures/demo-fixture.html</code>.
      </p>
    </div>
  );
};

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  onClear: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry, onClear }) => {
  return (
    <div className="status-view error-view">
      <div className="status-icon">⚠️</div>
      <h3>Capture Failed</h3>
      <p className="error-message">{message}</p>
      <div className="error-actions">
        <button className="btn btn-primary" onClick={onRetry}>
          🔄 Retry Capture
        </button>
        <button className="btn btn-secondary" onClick={onClear}>
          Reset State
        </button>
      </div>
    </div>
  );
};
