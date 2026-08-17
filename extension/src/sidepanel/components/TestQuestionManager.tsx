import React, { useState } from 'react';
import { TestQuestion, Block } from '../../../../packages/schema';

interface TestQuestionManagerProps {
  questions: TestQuestion[];
  blocks: Block[];
  onSelectQuestion: (question: TestQuestion) => void;
  onSaveQuestion: (question: TestQuestion) => void;
  onDeleteQuestion: (id: string) => void;
  onRequestDraftQuestions: (selectedBlockIds: string[]) => Promise<void>;
  isGeneratingDrafts: boolean;
}

export const TestQuestionManager: React.FC<TestQuestionManagerProps> = ({
  questions,
  blocks,
  onSelectQuestion,
  onSaveQuestion,
  onDeleteQuestion,
  onRequestDraftQuestions,
  isGeneratingDrafts,
}) => {
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [newQuery, setNewQuery] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [selectedForDraft, setSelectedForDraft] = useState<Set<string>>(new Set());

  const curatedQuestions = questions.filter((q) => q.status === 'curated');
  const draftQuestions = questions.filter((q) => q.status === 'draft');

  const handleCreateManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuery.trim()) return;

    const newQ: TestQuestion = {
      id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      query: newQuery.trim(),
      expectedBlockId: selectedBlockId ? selectedBlockId : undefined,
      notes: notes.trim() ? notes.trim() : undefined,
      status: 'curated',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveQuestion(newQ);
    setNewQuery('');
    setSelectedBlockId('');
    setNotes('');
    setMode('list');
  };

  const handleAcceptDraft = (draft: TestQuestion) => {
    onSaveQuestion({
      ...draft,
      status: 'curated',
      updatedAt: new Date().toISOString(),
    });
  };

  const toggleDraftBlockSelect = (blockId: string) => {
    setSelectedForDraft((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Evaluation Test Questions
        </h4>
        <div className="flex gap-1.5">
          <button
            onClick={() => setMode(mode === 'create' ? 'list' : 'create')}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded transition"
          >
            {mode === 'create' ? 'Cancel' : '+ New Question'}
          </button>
        </div>
      </div>

      {/* Manual Creation Form */}
      {mode === 'create' ? (
        <form onSubmit={handleCreateManual} className="space-y-2.5 bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Question / Query</label>
            <input
              type="text"
              required
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              placeholder="e.g., What are the token limits for heading-aware chunking?"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Expected Target Block (Ground Truth)</label>
            <select
              value={selectedBlockId}
              onChange={(e) => setSelectedBlockId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="">(None - Unsupervised query)</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  [{b.id}] {b.type} - {b.content.slice(0, 50)}...
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Tests heading edge case"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="px-3 py-1 bg-slate-800 text-slate-300 rounded hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 bg-blue-600 text-white rounded font-medium hover:bg-blue-500"
            >
              Save Question
            </button>
          </div>
        </form>
      ) : null}

      {/* LLM Draft Generator Panel */}
      <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80 text-xs">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-slate-400 font-medium">Auto-Draft with LLM</span>
          <button
            disabled={isGeneratingDrafts || selectedForDraft.size === 0}
            onClick={() => onRequestDraftQuestions(Array.from(selectedForDraft))}
            className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 rounded text-xs font-medium disabled:opacity-40 transition"
          >
            {isGeneratingDrafts ? 'Drafting...' : `Generate from (${selectedForDraft.size}) blocks`}
          </button>
        </div>
        <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
          {blocks.slice(0, 10).map((b) => (
            <label key={b.id} className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer hover:bg-slate-900/60 p-1 rounded">
              <input
                type="checkbox"
                checked={selectedForDraft.has(b.id)}
                onChange={() => toggleDraftBlockSelect(b.id)}
                className="rounded border-slate-700"
              />
              <span className="font-mono text-slate-500">[{b.id}]</span>
              <span className="truncate">{b.content.slice(0, 45)}...</span>
            </label>
          ))}
        </div>
      </div>

      {/* Review Queue (Drafts) */}
      {draftQuestions.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-amber-400 font-bold uppercase tracking-wider">
            <span>LLM Draft Review Queue ({draftQuestions.length})</span>
            <span className="text-[10px] text-amber-500/80 font-normal">Requires review before eval</span>
          </div>
          {draftQuestions.map((draft) => (
            <div key={draft.id} className="bg-amber-950/20 border border-amber-500/30 rounded p-2 text-xs space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <input
                  type="text"
                  value={draft.query}
                  onChange={(e) => onSaveQuestion({ ...draft, query: e.target.value })}
                  className="w-full bg-slate-900/90 border border-amber-600/40 rounded px-2 py-1 text-slate-200 text-xs"
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>Target: <strong>{draft.generatedFromBlockId || 'N/A'}</strong></span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onDeleteQuestion(draft.id)}
                    className="px-2 py-0.5 bg-rose-950 text-rose-300 hover:bg-rose-900 rounded"
                  >
                    Discard
                  </button>
                  <button
                    onClick={() => handleAcceptDraft(draft)}
                    className="px-2 py-0.5 bg-emerald-700 text-white hover:bg-emerald-600 rounded font-medium"
                  >
                    Accept into Eval Set
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Curated Questions List */}
      <div className="space-y-1">
        <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
          Curated Set ({curatedQuestions.length})
        </span>
        {curatedQuestions.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">No test questions created yet.</p>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {curatedQuestions.map((q) => (
              <div
                key={q.id}
                className="bg-slate-950 p-2 rounded border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-2 text-xs"
              >
                <div className="truncate flex-1">
                  <span className="text-slate-200 block truncate font-medium">{q.query}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Expected: {q.expectedBlockId || 'None'}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onSelectQuestion(q)}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] rounded font-medium"
                  >
                    Run
                  </button>
                  <button
                    onClick={() => onDeleteQuestion(q.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
