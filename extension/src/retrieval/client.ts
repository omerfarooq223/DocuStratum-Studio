import { Chunk, ModelStatusResponse, SearchResponse, SearchRequest, EmbedResponse, ChunkingStrategy } from '../../../packages/schema';

const SERVICE_BASE_URL = 'http://127.0.0.1:8000';

export class RetrievalServiceError extends Error {
  public code?: string;
  public status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'RetrievalServiceError';
    this.code = code;
    this.status = status;
  }
}

export async function fetchModelStatus(): Promise<ModelStatusResponse> {
  try {
    const response = await fetch(`${SERVICE_BASE_URL}/model/status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new RetrievalServiceError(
        `Failed to fetch model status: ${response.statusText}`,
        `HTTP_${response.status}`,
        response.status
      );
    }

    return await response.json();
  } catch (err: any) {
    if (err instanceof RetrievalServiceError) throw err;
    throw new RetrievalServiceError(
      `Cannot connect to local WebRAG companion service at ${SERVICE_BASE_URL}. Ensure 'uvicorn service.main:app --port 8000' is running.`,
      'SERVICE_OFFLINE'
    );
  }
}

export interface SearchOptions {
  topK?: number;
  strategy?: ChunkingStrategy;
}

export async function searchLocalChunks(
  query: string,
  chunks: Chunk[],
  options: SearchOptions = {}
): Promise<SearchResponse> {
  if (!query || !query.trim()) {
    throw new RetrievalServiceError('Search query cannot be empty.', 'EMPTY_QUERY', 400);
  }

  if (!chunks || chunks.length === 0) {
    throw new RetrievalServiceError('No candidate chunks available to search.', 'NO_CHUNKS', 400);
  }

  const payload: SearchRequest = {
    query: query.trim(),
    chunks,
    topK: options.topK ?? 5,
    strategy: options.strategy
  };

  try {
    const response = await fetch(`${SERVICE_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorDetail = response.statusText;
      try {
        const errorJson = await response.json();
        if (errorJson.error?.message) {
          errorDetail = errorJson.error.message;
        }
      } catch {
        // ignore json parse error on bad response
      }
      throw new RetrievalServiceError(
        `Search failed: ${errorDetail}`,
        `HTTP_${response.status}`,
        response.status
      );
    }

    return await response.json();
  } catch (err: any) {
    if (err instanceof RetrievalServiceError) throw err;
    throw new RetrievalServiceError(
      `Cannot connect to local WebRAG companion service at ${SERVICE_BASE_URL}. Ensure the service is running.`,
      'SERVICE_OFFLINE'
    );
  }
}

export async function embedLocalChunks(chunks: Chunk[]): Promise<EmbedResponse> {
  try {
    const response = await fetch(`${SERVICE_BASE_URL}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ chunks })
    });

    if (!response.ok) {
      throw new RetrievalServiceError(`Embed request failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (err: any) {
    if (err instanceof RetrievalServiceError) throw err;
    throw new RetrievalServiceError(`Embedding service unavailable: ${err.message}`, 'SERVICE_OFFLINE');
  }
}
