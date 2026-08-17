import {
  GroundedAnswerRequest,
  GroundedAnswerResponse,
  LLMProviderStatusResponse,
  AnswerStreamEvent,
} from '../../../../packages/schema';

const SERVICE_URL = 'http://127.0.0.1:8000';

export async function fetchLLMStatus(): Promise<LLMProviderStatusResponse> {
  try {
    const response = await fetch(`${SERVICE_URL}/llm/status`);
    if (!response.ok) {
      return {
        status: 'error',
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        hasApiKey: false,
        isAvailable: false,
        supportedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
        errorMessage: `Service returned HTTP ${response.status}`,
      };
    }
    return response.json();
  } catch (err: any) {
    return {
      status: 'error',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      hasApiKey: false,
      isAvailable: false,
      supportedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
      errorMessage: err?.message || 'Could not connect to local service.',
    };
  }
}

export async function generateGroundedAnswer(
  req: GroundedAnswerRequest,
  signal?: AbortSignal
): Promise<GroundedAnswerResponse> {
  const response = await fetch(`${SERVICE_URL}/llm/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || errJson.detail || errorDetail;
    } catch {
      // ignore
    }
    throw new Error(`Answer generation failed: ${errorDetail}`);
  }

  return response.json();
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (response: GroundedAnswerResponse) => void;
  onError: (error: string) => void;
}

export async function streamGroundedAnswer(
  req: GroundedAnswerRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  try {
    const response = await fetch(`${SERVICE_URL}/llm/answer/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        errorDetail = errJson.error?.message || errJson.detail || errorDetail;
      } catch {
        // ignore
      }
      callbacks.onError(`Stream failed: ${errorDetail}`);
      return;
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.substring(6);
          try {
            const event: AnswerStreamEvent = JSON.parse(dataStr);
            if (event.type === 'token' && event.token) {
              callbacks.onToken(event.token);
            } else if (event.type === 'done') {
              callbacks.onComplete({
                query: req.query,
                answer: event.answer || '',
                citations: event.citations || [],
                citationRefs: event.citationRefs || [],
                insufficientEvidence: Boolean(event.insufficientEvidence),
                model: event.model || 'llama-3.3-70b-versatile',
                provider: event.provider || 'groq',
                latencyMs: event.latencyMs || 0,
                promptVersion: event.promptVersion || 'v1.0.0',
              });
            } else if (event.type === 'error' && event.error) {
              callbacks.onError(event.error);
            }
          } catch {
            // Ignore malformed JSON event chunk
          }
        }
      }
    }
  } catch (err: any) {
    if (signal?.aborted) {
      callbacks.onError('Answer generation was cancelled.');
    } else {
      callbacks.onError(err?.message || 'Streaming connection failed.');
    }
  }
}
