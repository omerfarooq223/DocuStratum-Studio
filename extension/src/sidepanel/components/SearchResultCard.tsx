import React from 'react';
import { RetrievalResult } from '../../../../packages/schema';

interface SearchResultCardProps {
  result: RetrievalResult;
  onInspectBlock?: (blockId: string) => void;
  onInspectChunk?: (chunkId: string) => void;
}

export const SearchResultCard: React.FC<SearchResultCardProps> = ({
  result,
  onInspectBlock,
  onInspectChunk
}) => {
  const scorePercent = Math.max(0, Math.min(100, Math.round(result.score * 100)));
  
  // Color tone based on score
  const getScoreColorClass = (score: number) => {
    if (score >= 0.75) return 'score-high';
    if (score >= 0.5) return 'score-medium';
    return 'score-low';
  };

  const formattedStrategy = result.strategy === 'heading_aware' ? 'Heading-Aware' : 'Recursive';

  return (
    <div className={`retrieval-result-card rank-${result.rank}`}>
      <div className="result-card-header">
        <div className="result-rank-badge" title={`Rank #${result.rank}`}>
          #{result.rank}
        </div>
        
        <div className="result-badges">
          <span
            className={`result-score-badge ${getScoreColorClass(result.score)}`}
            title={`Score: ${result.score.toFixed(4)}${result.denseScore !== undefined && result.denseScore !== null ? ` | Dense: ${result.denseScore.toFixed(3)}` : ''}${result.bm25Score !== undefined && result.bm25Score !== null ? ` | BM25: ${result.bm25Score.toFixed(3)}` : ''}`}
          >
            <span className="score-meter-bar" style={{ width: `${scorePercent}%` }} />
            <span className="score-text">{(result.score).toFixed(3)} ({scorePercent}%)</span>
          </span>

          {result.searchMode && (
            <span
              className="strategy-pill-badge"
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: result.searchMode === 'hybrid' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                color: result.searchMode === 'hybrid' ? '#34d399' : '#a5b4fc',
                border: result.searchMode === 'hybrid' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)'
              }}
              title={`Retrieved via ${result.searchMode.toUpperCase()} mode`}
            >
              {result.searchMode === 'hybrid' ? '⚡ Hybrid' : result.searchMode === 'bm25' ? '🔤 BM25' : '🧠 Vector'}
            </span>
          )}

          <span className={`strategy-pill-badge pill-${result.strategy}`}>
            {formattedStrategy}
          </span>
        </div>
      </div>

      {result.headingPath && result.headingPath.length > 0 && (
        <div className="result-heading-path" title={result.headingPath.join(' > ')}>
          <span className="heading-path-icon">📂</span>
          {result.headingPath.map((segment, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="path-separator">›</span>}
              <span className="path-segment">{segment}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="result-excerpt">
        <p>{result.excerpt}</p>
      </div>

      <div className="result-card-footer">
        <div className="result-sources">
          <span className="source-label">Source blocks:</span>
          {result.sourceBlockIds && result.sourceBlockIds.length > 0 ? (
            result.sourceBlockIds.map((blockId) => (
              <button
                key={blockId}
                type="button"
                className="source-block-tag"
                title={`Click to inspect block ${blockId} in Review panel`}
                onClick={() => onInspectBlock?.(blockId)}
              >
                #{blockId.length > 12 ? `${blockId.slice(0, 10)}...` : blockId}
              </button>
            ))
          ) : (
            <span className="source-none">None</span>
          )}
        </div>

        {onInspectChunk && (
          <button
            type="button"
            className="inspect-chunk-btn"
            onClick={() => onInspectChunk(result.chunkId)}
            title="Inspect in Compare view"
          >
            Compare Chunk ↗
          </button>
        )}
      </div>
    </div>
  );
};
