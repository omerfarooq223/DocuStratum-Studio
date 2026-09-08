import React, { useState, useEffect, useMemo } from 'react';
import { Chunk, RetrievalResult, ChunkingStrategy, ModelStatusResponse, Block } from '../../../../packages/schema';
import { fetchModelStatus, searchLocalChunks, RetrievalServiceError } from '../../retrieval/client';
import { SearchResultCard } from './SearchResultCard';
import { GroundedAnswerPanel } from './GroundedAnswerPanel';

interface RetrievalViewProps {
  chunks: Chunk[];
  blocksMap?: Map<string, Block>;
  headingPaths?: string[][];
  sourceUrl?: string;
  onInspectBlock?: (blockId: string) => void;
  onInspectChunk?: (chunkId: string) => void;
}

export const RetrievalView: React.FC<RetrievalViewProps> = ({
  chunks,
  blocksMap = new Map(),
  headingPaths = [],
  sourceUrl,
  onInspectBlock,
  onInspectChunk
}) => {
  const [query, setQuery] = useState('');
  const [strategyFilter, setStrategyFilter] = useState<'all' | ChunkingStrategy>('all');
  const [searchMode, setSearchMode] = useState<'hybrid' | 'dense' | 'bm25'>('hybrid');
  const [results, setResults] = useState<RetrievalResult[]>([]);
  const [totalCandidates, setTotalCandidates] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatusResponse | null>(null);
  const [isCheckingModel, setIsCheckingModel] = useState(false);

  // Suggested queries derived from heading paths or common topics
  const suggestions = React.useMemo(() => {
    const set = new Set<string>();
    for (const path of headingPaths) {
      if (path && path.length > 0) {
        const last = path[path.length - 1];
        if (last && last.length > 3 && last.length < 50) {
          set.add(last);
        }
      }
    }
    return Array.from(set).slice(0, 4);
  }, [headingPaths]);

  const loadStatus = async () => {
    setIsCheckingModel(true);
    try {
      const status = await fetchModelStatus();
      setModelStatus(status);
      setError(null);
    } catch (err: any) {
      setModelStatus(null);
      // Only set error if not already set by a search
    } finally {
      setIsCheckingModel(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSearch = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const q = customQuery !== undefined ? customQuery : query;
    if (!q || !q.trim()) return;

    if (!chunks || chunks.length === 0) {
      setError('No chunks available. Please capture content and review chunks in Compare tab first.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const selectedStrategy = strategyFilter === 'all' ? undefined : strategyFilter;
      const resp = await searchLocalChunks(q, chunks, {
        topK: 5,
        strategy: selectedStrategy,
        searchMode
      });

      setResults(resp.results);
      setTotalCandidates(resp.totalCandidates);
      setLatencyMs(resp.latencyMs);
      if (customQuery !== undefined) {
        setQuery(customQuery);
      }
    } catch (err: any) {
      if (err instanceof RetrievalServiceError) {
        setError(err.message);
      } else {
        setError(err.message || 'An unexpected error occurred during search.');
      }
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setLatencyMs(null);
    setError(null);
  };

  // Prioritize chunks matching the search results in rank order for grounded answer generation
  const candidateChunksForLLM = useMemo(() => {
    if (results.length === 0) return chunks;
    const chunkMap = new Map(chunks.map((c) => [c.id, c]));
    const ranked: Chunk[] = [];
    const seenIds = new Set<string>();
    for (const r of results) {
      const c = chunkMap.get(r.chunkId);
      if (c && !seenIds.has(c.id)) {
        seenIds.add(c.id);
        ranked.push(c);
      }
    }
    // Append any remaining chunks
    for (const c of chunks) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        ranked.push(c);
      }
    }
    return ranked;
  }, [results, chunks]);

  return (
    <div className="retrieval-view-container">
      {/* Model & Service Status Header */}
      <div className="model-status-strip">
        <div className="model-status-info">
          <span className={`status-dot ${modelStatus?.status === 'ready' ? 'status-ready' : 'status-pending'}`} />
          <span className="model-name">
            {modelStatus?.modelName || 'all-MiniLM-L6-v2'} ({modelStatus?.dimension || 384}d)
          </span>
          <span className="privacy-badge" title="Embedding and search run 100% locally on your machine">
            🔒 Local & Private
          </span>
        </div>
        <button
          type="button"
          className="refresh-status-btn"
          onClick={loadStatus}
          disabled={isCheckingModel}
          title="Refresh model and service health status"
        >
          {isCheckingModel ? 'Checking...' : 'Check Status'}
        </button>
      </div>

      {/* Search Bar and Strategy Filter */}
      <form className="retrieval-search-form" onSubmit={(e) => handleSearch(e)}>
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search chunks (e.g. 'architecture', 'token limits', 'warning')..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading || chunks.length === 0}
          />
          {query && (
            <button
              type="button"
              className="clear-query-btn"
              onClick={handleClear}
              title="Clear search query"
            >
              ✕
            </button>
          )}
          <button
            type="submit"
            className="search-submit-btn"
            disabled={isLoading || !query.trim() || chunks.length === 0}
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div className="search-filters-bar">
          <div className="filter-group">
            <span className="filter-label">Strategy:</span>
            <div className="strategy-toggle-buttons">
              <button
                type="button"
                className={`filter-btn ${strategyFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStrategyFilter('all')}
              >
                All ({chunks.length})
              </button>
              <button
                type="button"
                className={`filter-btn ${strategyFilter === 'recursive' ? 'active' : ''}`}
                onClick={() => setStrategyFilter('recursive')}
              >
                Recursive ({chunks.filter((c) => c.strategy === 'recursive').length})
              </button>
              <button
                type="button"
                className={`filter-btn ${strategyFilter === 'heading_aware' ? 'active' : ''}`}
                onClick={() => setStrategyFilter('heading_aware')}
              >
                Heading-Aware ({chunks.filter((c) => c.strategy === 'heading_aware').length})
              </button>
            </div>
          </div>

          <div className="filter-group" style={{ marginTop: '0.4rem' }}>
            <span className="filter-label">Search Mode:</span>
            <div className="strategy-toggle-buttons">
              <button
                type="button"
                className={`filter-btn ${searchMode === 'hybrid' ? 'active' : ''}`}
                onClick={() => setSearchMode('hybrid')}
                title="Combines Dense Vector similarity and BM25 keyword matching via Reciprocal Rank Fusion"
              >
                ⚡ Hybrid (RRF)
              </button>
              <button
                type="button"
                className={`filter-btn ${searchMode === 'dense' ? 'active' : ''}`}
                onClick={() => setSearchMode('dense')}
                title="Pure Dense Vector Cosine Similarity"
              >
                🧠 Vector
              </button>
              <button
                type="button"
                className={`filter-btn ${searchMode === 'bm25' ? 'active' : ''}`}
                onClick={() => setSearchMode('bm25')}
                title="BM25 Lexical exact keyword and code identifier matching"
              >
                🔤 Keyword (BM25)
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Suggested Quick Queries */}
      {suggestions.length > 0 && results.length === 0 && !isLoading && (
        <div className="suggested-queries-section">
          <span className="suggestions-label">Suggested test queries from document headings:</span>
          <div className="suggestion-chips">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                className="suggestion-chip"
                onClick={() => handleSearch(undefined, s)}
                disabled={isLoading || chunks.length === 0}
              >
                "{s}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="retrieval-error-banner">
          <div className="error-title">
            <span className="error-icon">⚠️</span>
            <span>Retrieval Notice</span>
          </div>
          <div className="error-message">{error}</div>
          <button
            type="button"
            className="error-retry-btn"
            onClick={() => handleSearch()}
          >
            Retry Query
          </button>
        </div>
      )}

      {/* Results Header / Stats */}
      {results.length > 0 && (
        <div className="results-header-stats">
          <span className="results-count">
            Top {results.length} results from {totalCandidates} candidate chunks
          </span>
          {latencyMs !== null && (
            <span className="results-latency">
              ⚡ {latencyMs}ms local search latency
            </span>
          )}
        </div>
      )}

      {/* Grounded LLM Answer Generation */}
      {results.length > 0 && query && (
        <GroundedAnswerPanel
          query={query}
          chunks={candidateChunksForLLM}
          blocksMap={blocksMap}
          sourceUrl={sourceUrl}
        />
      )}

      {/* Results List */}
      <div className="retrieval-results-list">
        {isLoading && (
          <div className="retrieval-loading-state">
            <div className="spinner" />
            <p>Computing local embeddings & cosine similarity...</p>
          </div>
        )}

        {!isLoading && results.length > 0 && (
          results.map((result) => (
            <SearchResultCard
              key={`${result.strategy}-${result.chunkId}`}
              result={result}
              onInspectBlock={onInspectBlock}
              onInspectChunk={onInspectChunk}
            />
          ))
        )}

        {!isLoading && results.length === 0 && !error && query && (
          <div className="retrieval-empty-state">
            <p>No matching chunks found for "{query}".</p>
            <span className="empty-hint">Try broadening your search term or selecting All Strategies.</span>
          </div>
        )}

        {!isLoading && results.length === 0 && !error && !query && (
          <div className="retrieval-empty-state">
            <div className="empty-icon">🔎</div>
            <h3>Local Vector Retrieval</h3>
            <p>
              Search across your chunked blocks using local 384-dimensional sentence embeddings.
            </p>
            {chunks.length === 0 ? (
              <span className="empty-hint empty-warning">
                No chunks available. Capture a page or element first to generate chunks.
              </span>
            ) : (
              <span className="empty-hint">
                Type a query above or click one of the suggested topics to inspect top-5 ranked results.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
