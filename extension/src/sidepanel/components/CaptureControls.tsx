import React from 'react';
import { CaptureMode } from '../../../../packages/schema';

interface CaptureControlsProps {
  onCapture: (mode: CaptureMode) => void;
  isCapturing: boolean;
  activeMode: CaptureMode | null;
  hasCapture: boolean;
  onClear: () => void;
}

export const CaptureControls: React.FC<CaptureControlsProps> = ({
  onCapture,
  isCapturing,
  activeMode,
  hasCapture,
  onClear,
}) => {
  return (
    <div className="capture-controls-card">
      <div className="capture-header">
        <span className="section-label">DOM CAPTURE MODES</span>
        {hasCapture && (
          <button
            className="btn-link"
            onClick={onClear}
            disabled={isCapturing}
            title="Clear current capture draft"
          >
            Clear Draft
          </button>
        )}
      </div>

      <div className="capture-btn-group">
        <button
          className={`btn-mode ${activeMode === 'selection' && isCapturing ? 'active' : ''}`}
          onClick={() => onCapture('selection')}
          disabled={isCapturing}
        >
          <span className="btn-mode-icon">✂️</span>
          <span className="btn-mode-text">
            <strong>Selection</strong>
            <small>Highlight text on page</small>
          </span>
        </button>

        <button
          className={`btn-mode ${activeMode === 'element' && isCapturing ? 'active' : ''}`}
          onClick={() => onCapture('element')}
          disabled={isCapturing}
        >
          <span className="btn-mode-icon">🎯</span>
          <span className="btn-mode-text">
            <strong>Element</strong>
            <small>Click to pick container</small>
          </span>
        </button>

        <button
          className={`btn-mode ${activeMode === 'page' && isCapturing ? 'active' : ''}`}
          onClick={() => onCapture('page')}
          disabled={isCapturing}
        >
          <span className="btn-mode-icon">📄</span>
          <span className="btn-mode-text">
            <strong>Full Page</strong>
            <small>Extract main article</small>
          </span>
        </button>
      </div>

      {isCapturing && (
        <div className="capturing-banner">
          <span className="spinner"></span>
          <span>
            {activeMode === 'element'
              ? 'Element picker active! Click an element on the webpage...'
              : `Extracting ${activeMode} DOM content...`}
          </span>
        </div>
      )}
    </div>
  );
};
