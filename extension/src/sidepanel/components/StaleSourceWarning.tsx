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
    <div className="bg-amber-950/40 border border-amber-500/50 rounded-lg p-3 my-2 text-amber-200 text-xs flex flex-col gap-2 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-amber-400">
          <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Live DOM Anchor Stale</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-amber-400/70 hover:text-amber-200 text-xs px-1 rounded"
        >
          ✕
        </button>
      </div>
      <p className="text-amber-300/80 leading-relaxed">
        {reason || 'The live webpage DOM differs from the captured snapshot. Highlighting fell back to the saved block preview.'}
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onOpenSavedPreview}
          className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded font-medium transition-colors"
        >
          View Captured Preview
        </button>
      </div>
    </div>
  );
};
