import { RetrievalResult, RetrievalEvaluationResult, ChunkingStrategy, RAGTriadMetrics } from '../../../../packages/schema';

export interface ComputeMetricsParams {
  questionId: string;
  query: string;
  expectedBlockId?: string;
  strategy: ChunkingStrategy;
  topK: number;
  measuredLatencyMs: number;
  results: RetrievalResult[];
  notes?: string;
  answer?: string;
  citedExcerpts?: string[];
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'for', 'to', 'of', 'with', 'by',
  'is', 'are', 'was', 'were', 'it', 'this', 'that', 'and', 'or', 'as',
  'from', 'what', 'how', 'why', 'when', 'where', 'which', 'who', 'does', 'can'
]);

function extractKeywords(text: string): string[] {
  const tokens = text.toLowerCase().match(/\b[a-z0-9_]{2,}\b/g) || [];
  return tokens.filter((t) => !STOP_WORDS.has(t));
}

export function computeContextRelevance(query: string, results: RetrievalResult[]): number {
  if (!query.trim() || results.length === 0) return 0;
  const qTokens = extractKeywords(query);
  if (qTokens.length === 0) return 0.5;

  let totalScore = 0;
  let totalWeight = 0;

  results.forEach((r, idx) => {
    const weight = 1 / Math.log2(idx + 2); // DCG discount
    totalWeight += weight;
    const excerptLower = r.excerpt.toLowerCase();
    const matches = qTokens.filter((t) => excerptLower.includes(t)).length;
    const relevance = matches / qTokens.length;
    totalScore += relevance * weight;
  });

  return totalWeight > 0 ? Number(Math.min(1, totalScore / totalWeight).toFixed(2)) : 0;
}

export function computeGroundedness(answer: string, citedExcerpts: string[]): number {
  if (!answer.trim()) return 0;
  if (citedExcerpts.length === 0) return 0;

  const combinedContext = citedExcerpts.join(' ').toLowerCase();
  const sentences = answer
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  if (sentences.length === 0) return 1.0;

  let supportedSentences = 0;
  for (const sentence of sentences) {
    const keywords = extractKeywords(sentence);
    if (keywords.length <= 1) {
      supportedSentences += 1;
      continue;
    }
    const matched = keywords.filter((kw) => combinedContext.includes(kw)).length;
    const ratio = matched / keywords.length;
    if (ratio >= 0.45) {
      supportedSentences += 1;
    }
  }

  return Number((supportedSentences / sentences.length).toFixed(2));
}

export function computeAnswerRelevance(query: string, answer: string): number {
  if (!query.trim() || !answer.trim()) return 0;
  const qTokens = extractKeywords(query);
  if (qTokens.length === 0) return 0.7;

  const aLower = answer.toLowerCase();
  const matched = qTokens.filter((kw) => aLower.includes(kw)).length;
  const coverage = matched / qTokens.length;
  const lengthFactor = Math.min(1, answer.length / 100);
  const finalScore = coverage * 0.7 + lengthFactor * 0.3;

  return Number(Math.min(1, finalScore).toFixed(2));
}

export function computeRAGTriad(
  query: string,
  results: RetrievalResult[],
  answer?: string,
  citedExcerpts?: string[]
): RAGTriadMetrics {
  const contextRelevance = computeContextRelevance(query, results);
  const groundedness = answer ? computeGroundedness(answer, citedExcerpts || []) : 1.0;
  const answerRelevance = answer ? computeAnswerRelevance(query, answer) : contextRelevance;

  return {
    contextRelevance,
    groundedness,
    answerRelevance,
  };
}

/**
 * Accurately compute Hit@k, Mean Reciprocal Rank (MRR), and RAG Triad scores.
 */
export function computeRetrievalEvaluation(params: ComputeMetricsParams): RetrievalEvaluationResult {
  const { questionId, query, expectedBlockId, strategy, topK, measuredLatencyMs, results, notes, answer, citedExcerpts } = params;

  const nowIso = new Date().toISOString();
  const evalId = `eval_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const triad = computeRAGTriad(query, results, answer, citedExcerpts);

  if (!expectedBlockId || expectedBlockId.trim() === '') {
    return {
      id: evalId,
      questionId,
      query,
      strategy,
      topK,
      measuredLatencyMs,
      results,
      triad,
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
    triad,
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
