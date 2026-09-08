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
    <div className="debugger-card">
      <div className="debugger-panel-header">
        <div className="debugger-title-group">
          <span className="section-label">EVALUATION TEST QUESTIONS</span>
          <span className="debugger-panel-subtitle">Ground Truth QA Suite</span>
        </div>
        <div className="debugger-header-actions">
          <button
            type="button"
            onClick={() => setMode(mode === 'create' ? 'list' : 'create')}
            className="btn-debugger-action"
          >
            {mode === 'create' ? 'Cancel' : '+ New Question'}
          </button>
        </div>
      </div>

      {/* Manual Creation Form */}
      {mode === 'create' ? (
        <form onSubmit={handleCreateManual} className="debugger-form-well">
          <div className="debugger-form-group">
            <label className="debugger-form-label">Question / Query</label>
            <input
              type="text"
              required
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              placeholder="e.g., What are the token limits for heading-aware chunking?"
              className="debugger-input"
            />
          </div>

          <div className="debugger-form-group">
            <label className="debugger-form-label">Expected Target Block (Ground Truth)</label>
            <select
              value={selectedBlockId}
              onChange={(e) => setSelectedBlockId(e.target.value)}
              className="debugger-select"
            >
              <option value="">(None - Unsupervised query)</option>
              {blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  [{b.id}] {b.type} - {b.content.slice(0, 50)}...
                </option>
              ))}
            </select>
          </div>

          <div className="debugger-form-group">
            <label className="debugger-form-label">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Tests heading edge case"
              className="debugger-input"
            />
          </div>

          <div className="debugger-form-actions">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="btn-cancel-action"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-save-action"
            >
              Save Question
            </button>
          </div>
        </form>
      ) : null}

      {/* LLM Draft Generator Panel */}
      <div className="debugger-draft-panel">
        <div className="draft-panel-header">
          <span className="draft-panel-title">Auto-Draft with LLM</span>
          <button
            type="button"
            disabled={isGeneratingDrafts || selectedForDraft.size === 0}
            onClick={() => onRequestDraftQuestions(Array.from(selectedForDraft))}
            className="btn-draft-action"
          >
            {isGeneratingDrafts ? 'Drafting…' : `Generate from (${selectedForDraft.size}) blocks`}
          </button>
        </div>
        <div className="draft-blocks-scroll">
          {blocks.slice(0, 10).map((b) => (
            <label key={b.id} className="draft-block-option">
              <input
                type="checkbox"
                checked={selectedForDraft.has(b.id)}
                onChange={() => toggleDraftBlockSelect(b.id)}
                className="draft-checkbox"
              />
              <span className="draft-block-id">[{b.id}]</span>
              <span className="draft-block-text">{b.content.slice(0, 50)}…</span>
            </label>
          ))}
        </div>
      </div>

      {/* Review Queue (Drafts) */}
      {draftQuestions.length > 0 && (
        <div className="debugger-review-queue">
          <div className="review-queue-header">
            <span className="section-label text-warning">LLM DRAFT REVIEW QUEUE ({draftQuestions.length})</span>
            <span className="review-queue-hint">Requires review before evaluation</span>
          </div>
          {draftQuestions.map((draft) => (
            <div key={draft.id} className="review-draft-item">
              <div className="draft-query-input-wrap">
                <input
                  type="text"
                  value={draft.query}
                  onChange={(e) => onSaveQuestion({ ...draft, query: e.target.value })}
                  className="debugger-input draft-edit-input"
                />
              </div>
              <div className="draft-footer-row">
                <span className="draft-target-info">Target: <strong>{draft.generatedFromBlockId || 'N/A'}</strong></span>
                <div className="draft-actions">
                  <button
                    type="button"
                    onClick={() => onDeleteQuestion(draft.id)}
                    className="btn-discard"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAcceptDraft(draft)}
                    className="btn-accept"
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
      <div className="debugger-curated-section">
        <div className="curated-section-header">
          <span className="section-label">CURATED BENCHMARK SET ({curatedQuestions.length})</span>
        </div>
        {curatedQuestions.length === 0 ? (
          <p className="debugger-empty-text">No test questions created yet.</p>
        ) : (
          <div className="curated-questions-list">
            {curatedQuestions.map((q) => (
              <div key={q.id} className="curated-question-item">
                <div className="curated-item-meta">
                  <span className="curated-query-text">{q.query}</span>
                  <span className="curated-target-tag">
                    Expected: {q.expectedBlockId || 'None'}
                  </span>
                </div>
                <div className="curated-item-actions">
                  <button
                    type="button"
                    onClick={() => onSelectQuestion(q)}
                    className="btn-run-question"
                  >
                    Run
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteQuestion(q.id)}
                    className="btn-delete-question"
                    aria-label="Delete question"
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
