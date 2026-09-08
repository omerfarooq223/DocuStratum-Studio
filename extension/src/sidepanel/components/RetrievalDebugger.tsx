import React, { useState, useMemo } from 'react';
import {
  CaptureResult,
  Chunk,
  ChunkingStrategy,
  RetrievalEvaluationResult,
  TestQuestion,
  RetrievalResult,
} from '../../../../packages/schema';
import { calculateAggregateMetrics, computeRetrievalEvaluation } from '../utils/evaluationMetrics';
import { queryRetrievalService, generateDraftQuestionsService } from '../utils/retrievalClient';
import { EvaluationMetricsPanel } from './EvaluationMetricsPanel';
import { RetrievalResultCard } from './RetrievalResultCard';
import { TestQuestionManager } from './TestQuestionManager';
import { GroundedAnswerPanel } from './GroundedAnswerPanel';

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
  const [topK, setTopK] = useState<number>(5);
  const [expectedBlockId, setExpectedBlockId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<RetrievalResult[]>([]);
  const [evalRuns, setEvalRuns] = useState<RetrievalEvaluationResult[]>([]);
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);

  // Curated Questions State
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
    overrideQuery?: string,
    overrideExpectedBlockId?: string,
    questionId?: string
  ) => {
    const activeQ = overrideQuery !== undefined ? overrideQuery : query;
    const activeExpected = overrideExpectedBlockId !== undefined ? overrideExpectedBlockId : expectedBlockId;
    if (!activeQ.trim() || activeChunks.length === 0) return;

    setIsLoading(true);
    const start = performance.now();

    try {
      const response = await queryRetrievalService({
        query: activeQ,
        strategy,
        topK,
        chunks: activeChunks,
      });

      const latencyMs = Math.round(performance.now() - start);
      setResults(response.results);

      const evaluation = computeRetrievalEvaluation({
        questionId: questionId || `adhoc_${Date.now()}`,
        query: activeQ,
        expectedBlockId: activeExpected || undefined,
        strategy,
        topK,
        measuredLatencyMs: latencyMs,
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
    if (selectedBlockIds.length === 0) return;
    setIsGeneratingDrafts(true);

    try {
      const targetBlocks = captureResult.blocks.filter((b) => selectedBlockIds.includes(b.id));
      const drafts = await generateDraftQuestionsService(targetBlocks);
      setQuestions((prev) => [...drafts, ...prev]);
    } catch {
      // Fallback to local draft candidates if service is unavailable
      const draftCandidates: TestQuestion[] = selectedBlockIds.map((blockId) => {
        const block = blocksMap.get(blockId);
        const excerpt = block ? block.content.slice(0, 60).replace(/\n/g, ' ') : 'content';
        return {
          id: `draft_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          query: `What information is described in: "${excerpt}..."?`,
          expectedBlockId: blockId,
          generatedFromBlockId: blockId,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });
      setQuestions((prev) => [...draftCandidates, ...prev]);
    } finally {
      setIsGeneratingDrafts(false);
    }
  };

  const latestEval = evalRuns[0];
  const aggregateMetrics = useMemo(() => calculateAggregateMetrics(evalRuns), [evalRuns]);

  return (
    <div className="debugger-view-container">
      {/* Metrics Header */}
      <EvaluationMetricsPanel latestEval={latestEval} aggregate={aggregateMetrics} />

      {/* Query Bar */}
      <div className="debugger-query-card">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunQuery()}
            placeholder="Type query to test retrieval & visual trace..."
            className="search-input"
          />
          <button
            type="button"
            onClick={() => handleRunQuery()}
            disabled={isLoading || !query.trim()}
            className="search-submit-btn"
          >
            {isLoading ? 'Searching…' : 'Retrieve'}
          </button>
        </div>

        {/* Chunker & Ground Truth Selectors */}
        <div className="debugger-controls-grid">
          <div className="debugger-control-group">
            <label className="debugger-control-label">Chunker</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as ChunkingStrategy)}
              className="debugger-select"
            >
              <option value="recursive">Recursive Chunks ({recursiveChunks.length})</option>
              <option value="heading_aware">Heading-Aware ({headingChunks.length})</option>
            </select>
          </div>

          <div className="debugger-control-group">
            <label className="debugger-control-label">Top-K</label>
            <select
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="debugger-select"
            >
              <option value={3}>Top 3</option>
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
            </select>
          </div>

          <div className="debugger-control-group">
            <label className="debugger-control-label">Expected Block (Ground Truth)</label>
            <select
              value={expectedBlockId}
              onChange={(e) => setExpectedBlockId(e.target.value)}
              className="debugger-select"
            >
              <option value="">(None)</option>
              {captureResult.blocks.map((b) => (
                <option key={b.id} value={b.id}>
                  [{b.id}] {b.content.slice(0, 30)}…
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="debugger-results-section">
        <div className="debugger-results-toolbar">
          <span className="section-label">RETRIEVED CHUNKS ({results.length})</span>
          {results.length > 0 && <span className="export-spec-tag">Strategy: {strategy}</span>}
        </div>

        {results.length === 0 ? (
          <div className="debugger-empty-state">
            Execute a query above or select a curated test question below to inspect retrieval rankings.
          </div>
        ) : (
          <div className="retrieval-results-list">
            {results.map((res) => (
              <RetrievalResultCard
                key={res.chunkId}
                result={res}
                blocksMap={blocksMap}
                isExpectedMatch={Boolean(expectedBlockId && res.sourceBlockIds.includes(expectedBlockId))}
                sourceUrl={captureResult.capture.url}
              />
            ))}
          </div>
        )}
      </div>

      {/* Grounded LLM Answer Generation */}
      {results.length > 0 && query && (
        <GroundedAnswerPanel
          query={query}
          chunks={activeChunks}
          blocksMap={blocksMap}
          sourceUrl={captureResult.capture.url}
        />
      )}

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
