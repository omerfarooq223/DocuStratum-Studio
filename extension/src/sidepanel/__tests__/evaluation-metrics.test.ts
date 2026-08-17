import { describe, it, expect } from 'vitest';
import { computeRetrievalEvaluation, calculateAggregateMetrics } from '../utils/evaluationMetrics';
import { RetrievalResult } from '../../../../packages/schema';

describe('Evaluation Metrics Engine', () => {
  const dummyResults: RetrievalResult[] = [
    {
      chunkId: 'chk_1',
      score: 0.95,
      rank: 1,
      strategy: 'recursive',
      headingPath: ['Intro'],
      excerpt: 'First excerpt',
      sourceBlockIds: ['blk_101'],
    },
    {
      chunkId: 'chk_2',
      score: 0.85,
      rank: 2,
      strategy: 'recursive',
      headingPath: ['Details'],
      excerpt: 'Second excerpt',
      sourceBlockIds: ['blk_102'],
    },
    {
      chunkId: 'chk_3',
      score: 0.72,
      rank: 3,
      strategy: 'recursive',
      headingPath: ['Details'],
      excerpt: 'Third excerpt',
      sourceBlockIds: ['blk_103', 'blk_104'],
    },
    {
      chunkId: 'chk_4',
      score: 0.61,
      rank: 4,
      strategy: 'recursive',
      headingPath: ['Summary'],
      excerpt: 'Fourth excerpt',
      sourceBlockIds: ['blk_105'],
    },
  ];

  it('computes Hit@1, Hit@3, Hit@5 and MRR when target is at rank 1', () => {
    const evalResult = computeRetrievalEvaluation({
      questionId: 'q1',
      query: 'test query',
      expectedBlockId: 'blk_101',
      strategy: 'recursive',
      topK: 5,
      measuredLatencyMs: 12,
      results: dummyResults,
    });

    expect(evalResult.hitAt1).toBe(true);
    expect(evalResult.hitAt3).toBe(true);
    expect(evalResult.hitAt5).toBe(true);
    expect(evalResult.reciprocalRank).toBe(1.0);
    expect(evalResult.measuredLatencyMs).toBe(12);
  });

  it('computes Hit@3 and MRR = 0.3333 when target is at rank 3', () => {
    const evalResult = computeRetrievalEvaluation({
      questionId: 'q2',
      query: 'test query 2',
      expectedBlockId: 'blk_104',
      strategy: 'recursive',
      topK: 5,
      measuredLatencyMs: 25,
      results: dummyResults,
    });

    expect(evalResult.hitAt1).toBe(false);
    expect(evalResult.hitAt3).toBe(true);
    expect(evalResult.hitAt5).toBe(true);
    expect(evalResult.reciprocalRank).toBe(0.3333);
  });

  it('computes MRR = 0.0 and all false hits when target is missing from retrieved results', () => {
    const evalResult = computeRetrievalEvaluation({
      questionId: 'q3',
      query: 'unmatched query',
      expectedBlockId: 'blk_999',
      strategy: 'recursive',
      topK: 5,
      measuredLatencyMs: 18,
      results: dummyResults,
    });

    expect(evalResult.hitAt1).toBe(false);
    expect(evalResult.hitAt3).toBe(false);
    expect(evalResult.hitAt5).toBe(false);
    expect(evalResult.reciprocalRank).toBe(0.0);
  });

  it('leaves metrics undefined for unsupervised queries without ground truth', () => {
    const evalResult = computeRetrievalEvaluation({
      questionId: 'q4',
      query: 'open exploration query',
      expectedBlockId: undefined,
      strategy: 'heading_aware',
      topK: 5,
      measuredLatencyMs: 15,
      results: dummyResults,
    });

    expect(evalResult.hitAt1).toBeUndefined();
    expect(evalResult.hitAt3).toBeUndefined();
    expect(evalResult.hitAt5).toBeUndefined();
    expect(evalResult.reciprocalRank).toBeUndefined();
  });

  it('calculates aggregate metrics across multiple runs correctly', () => {
    const run1 = computeRetrievalEvaluation({
      questionId: 'q1',
      query: 'q1',
      expectedBlockId: 'blk_101',
      strategy: 'recursive',
      topK: 5,
      measuredLatencyMs: 10,
      results: dummyResults,
    });

    const run2 = computeRetrievalEvaluation({
      questionId: 'q2',
      query: 'q2',
      expectedBlockId: 'blk_102',
      strategy: 'recursive',
      topK: 5,
      measuredLatencyMs: 20,
      results: dummyResults,
    });

    const run3 = computeRetrievalEvaluation({
      questionId: 'q3',
      query: 'q3',
      expectedBlockId: 'blk_999',
      strategy: 'recursive',
      topK: 5,
      measuredLatencyMs: 30,
      results: dummyResults,
    });

    const agg = calculateAggregateMetrics([run1, run2, run3]);

    expect(agg.totalEvaluations).toBe(3);
    expect(agg.evaluatedWithGroundTruth).toBe(3);
    expect(agg.avgLatencyMs).toBe(20.0);
    // Hits at 1: run1 (rank 1), run2 (rank 2 - no), run3 (no) -> 1/3 = 0.3333
    expect(agg.hitAt1Rate).toBe(0.3333);
    // Hits at 3: run1 (rank 1), run2 (rank 2), run3 (no) -> 2/3 = 0.6667
    expect(agg.hitAt3Rate).toBe(0.6667);
    // MRR: (1.0 + 0.5 + 0.0) / 3 = 0.50
    expect(agg.meanReciprocalRank).toBe(0.5);
  });
});
