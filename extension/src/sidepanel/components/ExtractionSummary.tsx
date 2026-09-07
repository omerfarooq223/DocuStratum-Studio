import React from 'react';
import { ExtractionMetrics } from '../utils/metrics';

interface ExtractionSummaryProps {
  metrics: ExtractionMetrics;
  url: string;
  title: string;
  mode: string;
  timestamp: string;
  onOpenFullTab?: () => void;
}

export const ExtractionSummary: React.FC<ExtractionSummaryProps> = ({
  metrics,
  url,
  title,
  mode,
  timestamp,
  onOpenFullTab,
}) => {
  const formattedTime = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="extraction-summary-card">
      <div className="summary-header">
        <div className="source-info">
          <div className="source-title-row">
            <span className="source-title" title={title}>
              {title || 'Untitled Page'}
            </span>
            {onOpenFullTab && (
              <button
                type="button"
                className="btn-full-tab-link"
                onClick={onOpenFullTab}
                title="Open full page analysis in a separate browser tab"
              >
                ↗ Open in Full Tab
              </button>
            )}
          </div>
          <span className="source-meta">
            <span className="mode-badge">{mode.toUpperCase()}</span>
            <span className="url-preview" title={url}>
              {url}
            </span>
            <span className="timestamp">{formattedTime}</span>
          </span>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-box metric-included">
          <span className="metric-num">{metrics.includedBlocks}</span>
          <span className="metric-lbl">Included Blocks</span>
        </div>
        <div className="metric-box metric-excluded">
          <span className="metric-num">{metrics.excludedBlocks}</span>
          <span className="metric-lbl">Excluded</span>
        </div>
        <div className="metric-box metric-chars">
          <span className="metric-num">{metrics.totalCharacters.toLocaleString()}</span>
          <span className="metric-lbl">Characters</span>
        </div>
      </div>

      <div className="structures-row">
        <span className="structures-label">Structures:</span>
        <div className="structure-pills">
          {Object.entries(metrics.structureCounts).map(([type, count]) => {
            if (count === 0) return null;
            return (
              <span key={type} className={`struct-pill struct-${type}`}>
                {type}: <strong>{count}</strong>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
