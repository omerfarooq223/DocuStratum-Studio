import React, { useState, useMemo } from 'react';
import {
  CaptureResult,
  Chunk,
  ChunkingStrategy,
  RetrievalResult,
  RetrievalEvaluationResult,
  TestQuestion,
} from '../../../../packages/schema';
import { computeRetrievalEvaluation, calculateAggregateMetrics } from '../utils/evaluationMetrics';
import { queryRetrievalService, generateDraftQuestionsService } from '../utils/retrievalClient';
import { RetrievalResultCard } from './RetrievalResultCard';
import { EvaluationMetricsPanel } from './EvaluationMetricsPanel';
import { TestQuestionManager } from './TestQuestionManager';

interface RetrievalDebuggerProps {
  captureResult: CaptureResult;
  recursiveChunks: Chunk[];
  headingChunks: Chunk[];
}

export const RetrievalDebugger: React.FC<RetrievalDebuggerProps> = ({
  captureResult,
  recursiveChunks,
  headingChunks,
}) => {
  const [query, setQuery] = useState('');
  const [strategy, setStrategy] = useState<ChunkingStrategy>('recursive');
  const [topK, setTopK] = useState(5);
  const [expectedBlockId, setExpectedBlockId] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [results, setResults] = useState<RetrievalResult[]>([]);
  const [evalRuns, setEvalRuns] = useState<RetrievalEvaluationResult[]>([]);
  const [questions, setQuestions] = useState<TestQuestion[]>([
    {
      id: 'q_fixture_1',
      query: 'What is the maximum token count for chunks?',
      expectedBlockId: captureResult.blocks[1]?.id,
      status: 'curated',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'q_fixture_2',
      query: 'How does heading-aware strategy split content?',
      expectedBlockId: captureResult.blocks[2]?.id,
      status: 'curated',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'q_fixture_3',
      query: 'Where are source spans anchored?',
      expectedBlockId: captureResult.blocks[3]?.id,
      status: 'curated',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);

  const blocksMap = useMemo(() => {
    const map = new Map<string, (typeof captureResult.blocks)[0]>();
    captureResult.blocks.forEach((b) => map.set(b.id, b));
    return map;
  }, [captureResult.blocks]);

  const activeChunks = strategy === 'recursive' ? recursiveChunks : headingChunks;

  const handleRunQuery = async (
    customQuery?: string,
    customExpectedId?: string,
    questionId?: string
  ) => {
    const activeQ = customQuery ?? query;
    const activeExpected = customExpectedId ?? expectedBlockId;
    if (!activeQ.trim()) return;

    setIsLoading(true);
    const start = performance.now();

    try {
      const response = await queryRetrievalService({
        query: activeQ,
        strategy,
        topK,
        chunks: activeChunks,
      });

      const end = performance.now();
      const measuredLatencyMs = Math.round(end - start);

      setResults(response.results);

      const evaluation = computeRetrievalEvaluation({
        questionId: questionId || `adhoc_${Date.now()}`,
        query: activeQ,
        expectedBlockId: activeExpected || undefined,
        strategy,
        topK,
        measuredLatencyMs,
        results: response.results,
      });

      setEvalRuns((prev) => [evaluation, ...prev]);
    } catch (err) {
      console.error('Retrieval error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectQuestion = (q: TestQuestion) => {
    setQuery(q.query);
    setExpectedBlockId(q.expectedBlockId || '');
    void handleRunQuery(q.query, q.expectedBlockId, q.id);
  };

  const handleDraftQuestionsRequest = async (selectedBlockIds: string[]) => {
    setIsGeneratingDrafts(true);
    try {
      const targetBlocks = captureResult.blocks.filter((b) => selectedBlockIds.includes(b.id));
      const drafts = await generateDraftQuestionsService(targetBlocks);
      setQuestions((prev) => [...drafts, ...prev]);
    } catch (err) {
      console.error('Draft generation error:', err);
    } finally {
      setIsGeneratingDrafts(false);
    }
  };

  const latestEval = evalRuns[0];
  const aggregateMetrics = useMemo(() => calculateAggregateMetrics(evalRuns), [evalRuns]);

  return (
    <div className="space-y-4 pb-8">
      {/* Metrics Header */}
      <EvaluationMetricsPanel latestEval={latestEval} aggregate={aggregateMetrics} />

      {/* Query Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunQuery()}
            placeholder="Type query to test retrieval & visual trace..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-sans"
          />
          <button
            onClick={() => handleRunQuery()}
            disabled={isLoading || !query.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
          >
            {isLoading ? 'Searching...' : 'Retrieve'}
          </button>
        </div>

        {/* Chunker & Ground Truth Selectors */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Chunker</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as ChunkingStrategy)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs"
            >
              <option value="recursive">Recursive Chunks ({recursiveChunks.length})</option>
              <option value="heading_aware">Heading-Aware ({headingChunks.length})</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Top-K</label>
            <select
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs"
            >
              <option value={3}>Top 3</option>
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Expected Block</label>
            <select
              value={expectedBlockId}
              onChange={(e) => setExpectedBlockId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs"
            >
              <option value="">(None)</option>
              {captureResult.blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  [{b.id}] {b.content.slice(0, 20)}...
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
          <span>Retrieved Chunks ({results.length})</span>
          {results.length > 0 && <span className="font-mono text-slate-500">Strategy: {strategy}</span>}
        </div>

        {results.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-8 text-center text-xs text-slate-500">
            Execute a query or select a test question below to inspect retrieval rankings.
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((res) => (
              <RetrievalResultCard
                key={res.chunkId}
                result={res}
                blocksMap={blocksMap}
                isExpectedMatch={Boolean(expectedBlockId && res.sourceBlockIds.includes(expectedBlockId))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Evaluation Questions Manager */}
      <TestQuestionManager
        questions={questions}
        blocks={captureResult.blocks}
        onSelectQuestion={handleSelectQuestion}
        onSaveQuestion={(q) => {
          setQuestions((prev) => {
            const idx = prev.findIndex((item) => item.id === q.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = q;
              return updated;
            }
            return [q, ...prev];
          });
        }}
        onDeleteQuestion={(id) => setQuestions((prev) => prev.filter((q) => q.id !== id))}
        onRequestDraftQuestions={handleDraftQuestionsRequest}
        isGeneratingDrafts={isGeneratingDrafts}
      />
    </div>
  );
};
