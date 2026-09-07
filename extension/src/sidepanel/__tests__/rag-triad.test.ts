import { describe, it, expect } from 'vitest';
import {
  computeContextRelevance,
  computeGroundedness,
  computeAnswerRelevance,
  computeRAGTriad,
} from '../utils/evaluationMetrics';
import { RetrievalResult } from '../../../../packages/schema';

describe('RAG Triad Evaluation Metrics', () => {
  const sampleResults: RetrievalResult[] = [
    {
      chunkId: 'chk-1',
      score: 0.95,
      rank: 1,
      strategy: 'heading_aware',
      headingPath: ['Architecture'],
      excerpt: 'WebRAG utilizes all-MiniLM-L6-v2 local vector embeddings and BM25 hybrid search.',
      sourceBlockIds: ['b1'],
    },
    {
      chunkId: 'chk-2',
      score: 0.82,
      rank: 2,
      strategy: 'heading_aware',
      headingPath: ['Chunking'],
      excerpt: 'Deterministic chunking preserves structural heading paths and table rows.',
      sourceBlockIds: ['b2'],
    },
  ];

  it('computes context relevance correctly when chunks contain query terms', () => {
    const score = computeContextRelevance('vector embeddings hybrid search', sampleResults);
    expect(score).toBeGreaterThan(0.5);
  });

  it('returns low context relevance when chunks do not contain query terms', () => {
    const score = computeContextRelevance('quantum astrophysics telescope observatory', sampleResults);
    expect(score).toBeLessThan(0.3);
  });

  it('computes groundedness (faithfulness) accurately against cited excerpts', () => {
    const citedExcerpts = [
      'WebRAG utilizes all-MiniLM-L6-v2 local vector embeddings and BM25 hybrid search.',
    ];
    const groundedAnswer = 'WebRAG uses all-MiniLM-L6-v2 embeddings and BM25 hybrid search.';
    const hallucinatedAnswer = 'WebRAG runs an OpenAI GPT-4 server in Tokyo with MongoDB storage.';

    const highGroundedness = computeGroundedness(groundedAnswer, citedExcerpts);
    const lowGroundedness = computeGroundedness(hallucinatedAnswer, citedExcerpts);

    expect(highGroundedness).toBeGreaterThanOrEqual(0.8);
    expect(lowGroundedness).toBeLessThan(0.4);
  });

  it('computes answer relevance assessing query coverage', () => {
    const query = 'How does WebRAG run embeddings?';
    const relevantAnswer = 'WebRAG runs embeddings locally using all-MiniLM-L6-v2 with zero network calls.';
    const offTopicAnswer = 'Tomorrow the weather in London will be rainy and cloudy.';

    const relScore = computeAnswerRelevance(query, relevantAnswer);
    const offTopicScore = computeAnswerRelevance(query, offTopicAnswer);

    expect(relScore).toBeGreaterThan(0.7);
    expect(offTopicScore).toBeLessThan(0.4);
  });

  it('computes complete RAG Triad bundle', () => {
    const triad = computeRAGTriad(
      'vector embeddings search',
      sampleResults,
      'WebRAG runs vector embeddings locally with BM25 search.',
      [sampleResults[0].excerpt]
    );

    expect(triad.contextRelevance).toBeGreaterThan(0.5);
    expect(triad.groundedness).toBeGreaterThan(0.5);
    expect(triad.answerRelevance).toBeGreaterThan(0.5);
  });
});
