import React, { useEffect, useRef } from 'react';
import { Block } from '../../../../packages/schema';

interface SavedBlockPreviewModalProps {
  block: Block;
  isOpen: boolean;
  onClose: () => void;
}

export const SavedBlockPreviewModal: React.FC<SavedBlockPreviewModalProps> = ({
  block,
  isOpen,
  onClose,
}) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-preview-modal-title"
      onClick={onClose}
    >
      <div
        className="modal-content saved-preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="saved-preview-title-group">
            <span className="saved-preview-type-badge">
              {block.type}
            </span>
            <h3 id="saved-preview-modal-title" className="modal-title">
              Saved Preview: {block.id}
            </h3>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="btn-close-modal"
            onClick={onClose}
            aria-label="Close saved block preview"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="saved-preview-body">
          <div className="saved-preview-field">
            <span className="saved-preview-label">HEADING PATH</span>
            <p className="saved-preview-path-text">
              {block.headingPath.length > 0 ? block.headingPath.join(' › ') : '(Root / No Heading)'}
            </p>
          </div>

          <div className="saved-preview-field">
            <span className="saved-preview-label">CAPTURED BLOCK TEXT</span>
            <div className="saved-preview-content-box">
              {block.content}
            </div>
          </div>

          <div className="saved-preview-meta-grid">
            <div className="saved-preview-meta-item">
              <span className="saved-preview-meta-label">CSS Selector</span>
              <p className="saved-preview-meta-value" title={block.sourceAnchor.cssSelector}>
                {block.sourceAnchor.cssSelector || 'N/A'}
              </p>
            </div>
            <div className="saved-preview-meta-item">
              <span className="saved-preview-meta-label">Content Hash</span>
              <p className="saved-preview-meta-value" title={block.contentHash}>
                {block.contentHash}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="saved-preview-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn-modal-action"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
