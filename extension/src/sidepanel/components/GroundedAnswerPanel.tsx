import React, { useState, useEffect, useRef } from 'react';
import {
  Chunk,
  Block,
  GroundedAnswerResponse,
  LLMProviderStatusResponse,
  CitationRef,
} from '../../../../packages/schema';
import { fetchLLMStatus, streamGroundedAnswer } from '../utils/llmClient';
import { computeGroundedness, computeAnswerRelevance } from '../utils/evaluationMetrics';
import { StaleSourceWarning } from './StaleSourceWarning';
import { SavedBlockPreviewModal } from './SavedBlockPreviewModal';

interface GroundedAnswerPanelProps {
  query: string;
  chunks: Chunk[];
  blocksMap: Map<string, Block>;
  onInspectBlock?: (blockId: string) => void;
}

export const GroundedAnswerPanel: React.FC<GroundedAnswerPanelProps> = ({
  query,
  chunks,
  blocksMap,
  onInspectBlock,
}) => {
  const [providerStatus, setProviderStatus] = useState<LLMProviderStatusResponse | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [completedResponse, setCompletedResponse] = useState<GroundedAnswerResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'complete' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Stale highlight state
  const [highlightStatus, setHighlightStatus] = useState<'idle' | 'highlighting' | 'stale'>('idle');
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [previewBlock, setPreviewBlock] = useState<Block | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void fetchLLMStatus().then((res) => setProviderStatus(res));
  }, []);

  const handleGenerateAnswer = async () => {
    if (!query.trim() || chunks.length === 0) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setStatus('streaming');
    setAnswerText('');
    setCompletedResponse(null);
    setErrorMessage(null);
    setHighlightStatus('idle');
    setStaleReason(null);

    await streamGroundedAnswer(
      {
        query: query.trim(),
        chunks,
        temperature: 0.1,
      },
      {
        onToken: (token) => {
          setAnswerText((prev) => prev + token);
        },
        onComplete: (res) => {
          setCompletedResponse(res);
          setAnswerText(res.answer);
          setStatus('complete');
        },
        onError: (err) => {
          setStatus('error');
          setErrorMessage(err);
        },
      },
      abortController.signal
    );
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus('idle');
  };

  const handleCopy = () => {
    if (!answerText) return;
    void navigator.clipboard.writeText(answerText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleHighlightCitation = async (citation: CitationRef) => {
    const primaryBlockId = citation.sourceBlockIds[0];
    if (primaryBlockId && onInspectBlock) {
      onInspectBlock(primaryBlockId);
    }
    const block = primaryBlockId ? blocksMap.get(primaryBlockId) : undefined;

    if (!block) {
      setStaleReason('Contributing block anchor not found in active capture snapshot.');
      setHighlightStatus('stale');
      return;
    }

    setHighlightStatus('highlighting');

    try {
      if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
        setHighlightStatus('stale');
        setStaleReason('Browser tab messaging is unavailable. View saved block preview instead.');
        setPreviewBlock(block);
        return;
      }

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) {
        throw new Error('No active browser tab found.');
      }

      const response = await chrome.tabs.sendMessage(activeTab.id, {
        action: 'HIGHLIGHT_SOURCE_BLOCK',
        target: block.sourceAnchor,
      });

      if (response && response.ok) {
        setHighlightStatus('idle');
        setStaleReason(null);
      } else {
        setHighlightStatus('stale');
        setStaleReason(response?.reason || 'Live element is missing or changed.');
        setPreviewBlock(block);
      }
    } catch (err: any) {
      setHighlightStatus('stale');
      setStaleReason(err?.message || 'Could not connect to live page content script.');
      setPreviewBlock(block);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Grounded LLM Answer
          </h4>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-700/50">
            {providerStatus?.model || 'llama-3.3-70b-versatile'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {status === 'streaming' ? (
            <button
              onClick={handleCancel}
              className="px-2.5 py-1 bg-rose-950 text-rose-300 hover:bg-rose-900 rounded text-xs font-medium transition"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={handleGenerateAnswer}
              disabled={!query.trim() || chunks.length === 0}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm transition"
            >
              {status === 'complete' ? 'Regenerate' : 'Generate Answer'}
            </button>
          )}
        </div>
      </div>

      {/* Provider Offline / Unconfigured Notice */}
      {providerStatus && !providerStatus.hasApiKey && (
        <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xs text-slate-400 space-y-1">
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <span>ℹ️ Groq API Key Not Configured</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Set <code className="text-slate-200 bg-slate-900 px-1 py-0.5 rounded">GROQ_API_KEY</code> in your service environment to enable grounded generative answers. Capture, vector retrieval, and RAG export remain 100% functional without an LLM.
          </p>
        </div>
      )}

      {/* Answer Stream & Text Display */}
      {status !== 'idle' && (
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-3">
          {/* Insufficient Evidence Warning Banner */}
          {completedResponse?.insufficientEvidence && (
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-lg p-2.5 text-amber-300 text-xs flex items-start gap-2">
              <span className="text-amber-400 font-bold">⚠️ Insufficient Context:</span>
              <p className="text-[11px] leading-relaxed">
                The captured page evidence does not contain sufficient facts to fully answer this question. The model refused to fabricate false information.
              </p>
            </div>
          )}

          {/* Answer Body */}
          <div className="text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
            {answerText}
            {status === 'streaming' && (
              <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-1 animate-pulse"></span>
            )}
          </div>

          {/* Action Bar, Latency & RAG Triad Indicators */}
          {status === 'complete' && (
            <div className="space-y-2 pt-2 border-t border-slate-800/70">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-3 text-slate-400 font-mono text-[10px]">
                  <span>Latency: <strong className="text-indigo-300">{completedResponse?.latencyMs ?? 0} ms</strong></span>
                  <span>Citations: <strong className="text-slate-200">{completedResponse?.citations.length ?? 0}</strong></span>
                </div>
                <button
                  onClick={handleCopy}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition"
                >
                  {copied ? '✓ Copied' : 'Copy Answer'}
                </button>
              </div>

              {completedResponse && (
                <div className="flex items-center gap-2 pt-1 border-t border-slate-800/40 text-[10px]">
                  <span className="text-slate-400 font-medium">Triad:</span>
                  <span
                    className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/40 font-mono"
                    title="Groundedness: Percentage of statements verified by cited excerpts"
                  >
                    🛡️ Grounded {Math.round(computeGroundedness(completedResponse.answer, completedResponse.citationRefs.map((c) => c.excerpt)) * 100)}%
                  </span>
                  <span
                    className="px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/40 font-mono"
                    title="Answer Relevance: Semantic coverage of prompt query"
                  >
                    🎯 Relevance {Math.round(computeAnswerRelevance(query, completedResponse.answer) * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error Banner */}
      {status === 'error' && errorMessage && (
        <div className="bg-rose-950/40 border border-rose-500/50 p-3 rounded-lg text-rose-300 text-xs space-y-1.5">
          <div className="font-semibold text-rose-400 flex items-center gap-1.5">
            <span>Generation Error</span>
          </div>
          <p className="text-[11px] leading-relaxed">{errorMessage}</p>
          <div className="flex justify-end pt-1">
            <button
              onClick={handleGenerateAnswer}
              className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-900 text-rose-200 rounded text-xs transition"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Validated Citations Evidence List */}
      {completedResponse && completedResponse.citationRefs.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
            Retrieved Citations & Source Proof ({completedResponse.citationRefs.length})
          </span>
          <div className="space-y-1.5">
            {completedResponse.citationRefs.map((cite) => (
              <div
                key={cite.chunkId}
                className="bg-slate-950/90 border border-indigo-950/80 hover:border-indigo-800/80 rounded-lg p-2.5 text-xs flex items-center justify-between gap-3 transition"
              >
                <div className="truncate flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-mono text-indigo-400 font-semibold text-[10px]">
                      [{cite.chunkId}]
                    </span>
                    {cite.headingPath.length > 0 && (
                      <span className="text-slate-400 font-mono text-[10px] truncate">
                        {cite.headingPath.join(' › ')}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300 font-mono text-[11px] truncate">
                    {cite.excerpt}
                  </p>
                </div>
                <button
                  onClick={() => handleHighlightCitation(cite)}
                  className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded text-[11px] shrink-0 font-medium transition"
                >
                  Highlight Source ↗
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stale Warning & Modal */}
      {highlightStatus === 'stale' && (
        <StaleSourceWarning
          reason={staleReason || undefined}
          onOpenSavedPreview={() => previewBlock && setPreviewBlock(previewBlock)}
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
