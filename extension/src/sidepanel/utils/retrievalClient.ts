import { Chunk, ChunkingStrategy, RetrievalResult, TestQuestion, Block, SearchMode } from '../../../../packages/schema';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';

const SERVICE_URL = 'http://127.0.0.1:8000';

export interface QueryRetrievalRequest {
  query: string;
  strategy: ChunkingStrategy;
  topK: number;
  chunks: Chunk[];
  searchMode?: SearchMode;
  minScore?: number;
}

export interface QueryRetrievalResponse {
  results: RetrievalResult[];
  executionTimeMs: number;
  searchMode?: SearchMode;
  degraded?: boolean;
  fallbackReason?: string;
}

/**
 * Executes vector search against the local FastAPI service
 */
export async function queryRetrievalService(
  req: QueryRetrievalRequest,
  timeoutMs: number = 15000
): Promise<QueryRetrievalResponse> {
  const response = await fetchWithTimeout(`${SERVICE_URL}/retrieval/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    timeoutMs,
  });

  if (!response.ok) {
    let errorDetail = `status ${response.status}`;
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || errJson.detail || errorDetail;
    } catch {
      // ignore
    }
    throw new Error(`Retrieval service failed: ${errorDetail}`);
  }

  return response.json();
}

/**
 * Requests LLM-generated draft questions from candidate source blocks
 */
export async function generateDraftQuestionsService(
  blocks: Block[],
  timeoutMs: number = 15000
): Promise<TestQuestion[]> {
  const response = await fetchWithTimeout(`${SERVICE_URL}/evaluation/draft-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
    timeoutMs,
  });

  if (!response.ok) {
    let errorDetail = `status ${response.status}`;
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || errJson.detail || errorDetail;
    } catch {
      // ignore
    }
    throw new Error(`Question generation service failed: ${errorDetail}`);
  }

  const data = await response.json();
  return data.questions;
}
