import React, { useState } from 'react';
import { RetrievalResult, Block } from '../../../../packages/schema';
import { highlightSourceBlockInTab } from '../utils/highlighterClient';
import { StaleSourceWarning } from './StaleSourceWarning';
import { SavedBlockPreviewModal } from './SavedBlockPreviewModal';

interface RetrievalResultCardProps {
  result: RetrievalResult;
  blocksMap: Map<string, Block>;
  isExpectedMatch: boolean;
  sourceUrl?: string;
}

export const RetrievalResultCard: React.FC<RetrievalResultCardProps> = ({
  result,
  blocksMap,
  isExpectedMatch,
  sourceUrl,
}) => {
  const [highlightStatus, setHighlightStatus] = useState<'idle' | 'highlighting' | 'stale'>('idle');
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [previewBlock, setPreviewBlock] = useState<Block | null>(null);

  const primaryBlockId = result.sourceBlockIds[0];
  const primaryBlock = primaryBlockId ? blocksMap.get(primaryBlockId) : undefined;

  const handleHighlight = async () => {
    if (!primaryBlock) {
      setStaleReason('Block metadata not found in active capture.');
      setHighlightStatus('stale');
      return;
    }

    setHighlightStatus('highlighting');
    const res = await highlightSourceBlockInTab(primaryBlock.sourceAnchor, sourceUrl);
    if (res.ok) {
      setHighlightStatus('idle');
      setStaleReason(null);
      setPreviewBlock(null);
    } else {
      setHighlightStatus('stale');
      setStaleReason(res.reason || 'Live element is missing or changed.');
      setPreviewBlock(primaryBlock);
    }
  };

  const formattedStrategy = result.strategy === 'heading_aware' ? 'Heading-Aware' : 'Recursive';

  return (
    <div className={`retrieval-result-card rank-${result.rank} ${isExpectedMatch ? 'ground-truth-match' : ''}`}>
      {/* Header Info */}
      <div className="result-card-header">
        <div className="result-card-left">
          <span className="result-rank-badge">#{result.rank}</span>
          <span className="result-score-badge score-high">
            Score: {(result.score * 100).toFixed(1)}%
          </span>
          {isExpectedMatch && (
            <span className="badge-ground-truth">Ground Truth Match</span>
          )}
        </div>
        <span className={`strategy-pill-badge pill-${result.strategy}`}>
          {formattedStrategy}
        </span>
      </div>

      {/* Heading Path */}
      {result.headingPath.length > 0 && (
        <div className="result-heading-path" title={result.headingPath.join(' › ')}>
          {result.headingPath.join(' › ')}
        </div>
      )}

      {/* Excerpt */}
      <div className="result-card-content">
        <p className="result-excerpt">{result.excerpt}</p>
      </div>

      {/* Action Footer */}
      <div className="result-card-footer">
        <span className="result-source-blocks">
          Source: {result.sourceBlockIds.join(', ') || 'unknown'}
        </span>
        <button
          type="button"
          onClick={handleHighlight}
          className="btn-highlight-source"
          title="Jump to element in live webpage and highlight anchor"
        >
          <span>Highlight Source</span>
          <span className="btn-icon-jump">↗</span>
        </button>
      </div>

      {/* Stale Warning & Modal */}
      {highlightStatus === 'stale' && (
        <StaleSourceWarning
          reason={staleReason || undefined}
          onOpenSavedPreview={() => primaryBlock && setPreviewBlock(primaryBlock)}
          onDismiss={() => setHighlightStatus('idle')}
        />
      )}

      {previewBlock && (
        <SavedBlockPreviewModal
          block={previewBlock}
          isOpen={Boolean(previewBlock)}
          onClose={() => setPreviewBlock(null)}
        />
      )}
    </div>
  );
};
