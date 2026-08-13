import React, { useState } from 'react';

interface CleanedMarkdownPreviewProps {
  markdown: string;
  includedCount: number;
  totalCount: number;
}

export const CleanedMarkdownPreview: React.FC<CleanedMarkdownPreviewProps> = ({
  markdown,
  includedCount,
  totalCount,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy using textarea element if clipboard API fails
      const textarea = document.createElement('textarea');
      textarea.value = markdown;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="markdown-preview-card">
      <div className="preview-toolbar">
        <div className="preview-meta">
          <span className="section-label">LIVE CLEANED MARKDOWN</span>
          <span className="included-info">
            Generated from <strong>{includedCount}</strong> of <strong>{totalCount}</strong> blocks
          </span>
        </div>

        <button className="btn-copy" onClick={handleCopy} disabled={!markdown}>
          {copied ? '✓ Copied to Clipboard' : '📋 Copy Markdown'}
        </button>
      </div>

      <div className="markdown-content-box">
        {markdown ? (
          <pre className="markdown-code">
            <code>{markdown}</code>
          </pre>
        ) : (
          <div className="markdown-empty-state">
            <p>No included blocks to generate Markdown.</p>
            <small>Toggle blocks back on in the Block Tree view to see live preview.</small>
          </div>
        )}
      </div>
    </div>
  );
};
