import React from 'react';
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-900/60 text-blue-300 border border-blue-700/50 uppercase">
              {block.type}
            </span>
            <h3 className="font-semibold text-slate-200 text-sm truncate max-w-xs">
              Saved Preview: {block.id}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg leading-none px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-3 text-xs">
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Heading Path</label>
            <p className="text-slate-300 font-mono text-[11px] mt-0.5">
              {block.headingPath.length > 0 ? block.headingPath.join(' > ') : '(Root)'}
            </p>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Captured Block Text</label>
            <div className="mt-1 p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
              {block.content}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/50 p-2.5 rounded border border-slate-800/80">
            <div>
              <span className="text-slate-500">CSS Selector:</span>
              <p className="font-mono text-slate-400 truncate" title={block.sourceAnchor.cssSelector}>
                {block.sourceAnchor.cssSelector || 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Content Hash:</span>
              <p className="font-mono text-slate-400 truncate" title={block.contentHash}>
                {block.contentHash}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded transition"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
