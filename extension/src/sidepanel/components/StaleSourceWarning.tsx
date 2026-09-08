import React from 'react';

interface StaleSourceWarningProps {
  reason?: string;
  onOpenSavedPreview: () => void;
  onDismiss: () => void;
}

export const StaleSourceWarning: React.FC<StaleSourceWarningProps> = ({
  reason,
  onOpenSavedPreview,
  onDismiss,
}) => {
  return (
    <div className="stale-source-alert" role="alert">
      <div className="stale-source-header">
        <div className="stale-source-title">
          <span className="stale-source-icon" aria-hidden="true">⚠️</span>
          <span>Live DOM Anchor Stale</span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="stale-source-dismiss-btn"
          aria-label="Dismiss stale anchor warning"
        >
          ✕
        </button>
      </div>
      <p className="stale-source-message">
        {reason || 'The live webpage DOM differs from the captured snapshot. Highlighting fell back to the saved block preview.'}
      </p>
      <div className="stale-source-actions">
        <button
          type="button"
          onClick={onOpenSavedPreview}
          className="stale-source-preview-btn"
        >
          View Captured Preview
        </button>
      </div>
    </div>
  );
};
