import { RetrievalResult, RetrievalEvaluationResult, ChunkingStrategy } from '../../../../packages/schema';

export interface ComputeMetricsParams {
  questionId: string;
  query: string;
  expectedBlockId?: string;
  strategy: ChunkingStrategy;
  topK: number;
  measuredLatencyMs: number;
  results: RetrievalResult[];
  notes?: string;
}

/**
 * Accurately compute Hit@k and Mean Reciprocal Rank (MRR).
 * If expectedBlockId is undefined or blank, metrics remain undefined (unsupervised query).
 */
export function computeRetrievalEvaluation(params: ComputeMetricsParams): RetrievalEvaluationResult {
  const { questionId, query, expectedBlockId, strategy, topK, measuredLatencyMs, results, notes } = params;

  const nowIso = new Date().toISOString();
  const evalId = `eval_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  if (!expectedBlockId || expectedBlockId.trim() === '') {
    return {
      id: evalId,
      questionId,
      query,
      strategy,
      topK,
      measuredLatencyMs,
      results,
      timestamp: nowIso,
      notes,
    };
  }

  const cleanExpectedId = expectedBlockId.trim();

  // Check top-1, top-3, top-5 hits
  const top1Matches = results.slice(0, 1).some((r) => r.sourceBlockIds.includes(cleanExpectedId));
  const top3Matches = results.slice(0, 3).some((r) => r.sourceBlockIds.includes(cleanExpectedId));
  const top5Matches = results.slice(0, 5).some((r) => r.sourceBlockIds.includes(cleanExpectedId));

  // Find 1-based rank of the first hit
  let firstRank: number | null = null;
  for (let i = 0; i < results.length; i++) {
    if (results[i].sourceBlockIds.includes(cleanExpectedId)) {
      firstRank = i + 1;
      break;
    }
  }

  const reciprocalRank = firstRank !== null ? Number((1.0 / firstRank).toFixed(4)) : 0.0;

  return {
    id: evalId,
    questionId,
    query,
    expectedBlockId: cleanExpectedId,
    strategy,
    topK,
    measuredLatencyMs,
    results,
    hitAt1: top1Matches,
    hitAt3: top3Matches,
    hitAt5: top5Matches,
    reciprocalRank,
    timestamp: nowIso,
    notes,
  };
}

export interface AggregateMetrics {
  totalEvaluations: number;
  evaluatedWithGroundTruth: number;
  hitAt1Rate: number | null;
  hitAt3Rate: number | null;
  hitAt5Rate: number | null;
  meanReciprocalRank: number | null;
  avgLatencyMs: number;
}

/**
 * Aggregates an array of evaluation runs for high-level benchmarking
 */
export function calculateAggregateMetrics(runs: RetrievalEvaluationResult[]): AggregateMetrics {
  if (runs.length === 0) {
    return {
      totalEvaluations: 0,
      evaluatedWithGroundTruth: 0,
      hitAt1Rate: null,
      hitAt3Rate: null,
      hitAt5Rate: null,
      meanReciprocalRank: null,
      avgLatencyMs: 0,
    };
  }

  const totalLatency = runs.reduce((acc, r) => acc + r.measuredLatencyMs, 0);
  const avgLatencyMs = Number((totalLatency / runs.length).toFixed(2));

  const gtRuns = runs.filter((r) => r.expectedBlockId !== undefined && r.expectedBlockId.trim() !== '');

  if (gtRuns.length === 0) {
    return {
      totalEvaluations: runs.length,
      evaluatedWithGroundTruth: 0,
      hitAt1Rate: null,
      hitAt3Rate: null,
      hitAt5Rate: null,
      meanReciprocalRank: null,
      avgLatencyMs,
    };
  }

  const hits1 = gtRuns.filter((r) => r.hitAt1).length;
  const hits3 = gtRuns.filter((r) => r.hitAt3).length;
  const hits5 = gtRuns.filter((r) => r.hitAt5).length;
  const sumRr = gtRuns.reduce((acc, r) => acc + (r.reciprocalRank || 0), 0);

  return {
    totalEvaluations: runs.length,
    evaluatedWithGroundTruth: gtRuns.length,
    hitAt1Rate: Number((hits1 / gtRuns.length).toFixed(4)),
    hitAt3Rate: Number((hits3 / gtRuns.length).toFixed(4)),
    hitAt5Rate: Number((hits5 / gtRuns.length).toFixed(4)),
    meanReciprocalRank: Number((sumRr / gtRuns.length).toFixed(4)),
    avgLatencyMs,
  };
}
