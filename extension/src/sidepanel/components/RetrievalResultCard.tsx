import React, { useState } from 'react';
import { RetrievalResult, Block } from '../../../../packages/schema';
import { StaleSourceWarning } from './StaleSourceWarning';
import { SavedBlockPreviewModal } from './SavedBlockPreviewModal';

interface RetrievalResultCardProps {
  result: RetrievalResult;
  blocksMap: Map<string, Block>;
  isExpectedMatch: boolean;
}

export const RetrievalResultCard: React.FC<RetrievalResultCardProps> = ({
  result,
  blocksMap,
  isExpectedMatch,
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
    try {
      if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
        // In testing / preview mode without tab messaging API
        setHighlightStatus('stale');
        setStaleReason('Browser tab messaging unavailable. View saved block preview instead.');
        return;
      }

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) {
        throw new Error('No active browser tab found.');
      }

      const response = await chrome.tabs.sendMessage(activeTab.id, {
        action: 'HIGHLIGHT_SOURCE_BLOCK',
        target: primaryBlock.sourceAnchor,
      });

      if (response && response.ok) {
        setHighlightStatus('idle');
        setStaleReason(null);
      } else {
        setHighlightStatus('stale');
        setStaleReason(response?.reason || 'Live element is missing or changed.');
      }
    } catch (err: any) {
      setHighlightStatus('stale');
      setStaleReason(err?.message || 'Could not reach content script in active tab.');
    }
  };

  return (
    <div
      className={`border rounded-lg p-3 transition-all ${
        isExpectedMatch
          ? 'bg-emerald-950/20 border-emerald-500/60 shadow-emerald-950/20'
          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-mono text-[11px] font-bold">
            #{result.rank}
          </span>
          <span className="text-[11px] font-mono text-blue-400 font-semibold">
            Score: {(result.score * 100).toFixed(1)}%
          </span>
          {isExpectedMatch && (
            <span className="px-2 py-0.5 bg-emerald-900/60 text-emerald-300 border border-emerald-600/50 rounded text-[10px] font-semibold">
              Ground Truth Match
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-500 font-mono uppercase">
          {result.strategy}
        </span>
      </div>

      {/* Heading Path */}
      {result.headingPath.length > 0 && (
        <div className="text-[11px] text-slate-400 font-mono mb-1 truncate">
          {result.headingPath.join(' > ')}
        </div>
      )}

      {/* Excerpt */}
      <p className="text-xs text-slate-200 font-mono bg-slate-950/70 p-2 rounded border border-slate-800/80 mb-2 leading-relaxed whitespace-pre-wrap">
        {result.excerpt}
      </p>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px]">
        <div className="text-slate-400 font-mono text-[10px]">
          Source: {result.sourceBlockIds.join(', ') || 'unknown'}
        </div>
        <button
          onClick={handleHighlight}
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 rounded transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span>Highlight Source</span>
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
