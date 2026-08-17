import { Chunk, ChunkingStrategy, RetrievalResult, TestQuestion, Block } from '../../../../packages/schema';

const SERVICE_URL = 'http://127.0.0.1:8000';

export interface QueryRetrievalRequest {
  query: string;
  strategy: ChunkingStrategy;
  topK: number;
  chunks: Chunk[];
}

export interface QueryRetrievalResponse {
  results: RetrievalResult[];
  executionTimeMs: number;
}

/**
 * Executes vector search against the local FastAPI service
 */
export async function queryRetrievalService(req: QueryRetrievalRequest): Promise<QueryRetrievalResponse> {
  const response = await fetch(`${SERVICE_URL}/retrieval/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    throw new Error(`Retrieval service failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Requests LLM-generated draft questions from candidate source blocks
 */
export async function generateDraftQuestionsService(blocks: Block[]): Promise<TestQuestion[]> {
  const response = await fetch(`${SERVICE_URL}/evaluation/draft-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });

  if (!response.ok) {
    throw new Error(`Question generation service failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.questions;
}
