import React, { useEffect, useMemo, useState } from 'react';
import {
  CaptureResult,
  Block,
  Chunk,
  CaptureMode,
  HealthResponse,
  VersionResponse,
} from '../../../packages/schema';
import { generateCleanedMarkdown } from './utils/markdown';
import { calculateExtractionMetrics } from './utils/metrics';
import { saveDraftCapture, loadDraftCapture, clearDraftCapture } from './utils/storage';
import { requestCapture, RestrictedTabError } from './utils/captureClient';
import { chunkBothStrategies } from '../chunking';

import { CaptureControls } from './components/CaptureControls';
import { ExtractionSummary } from './components/ExtractionSummary';
import { BlockTree } from './components/BlockTree';
import { CleanedMarkdownPreview } from './components/CleanedMarkdownPreview';
import { ChunkComparison } from './components/ChunkComparison';
import { RetrievalView } from './components/RetrievalView';
import { RetrievalDebugger } from './components/RetrievalDebugger';
import { ExportPackagePanel } from './components/ExportPackagePanel';
import { EmptyState, RestrictedPageState, ErrorState } from './components/StatusViews';

const SERVICE_URL = 'http://127.0.0.1:8000';
const EMPTY_BLOCKS: Block[] = [];
const EMPTY_CHUNKS: Chunk[] = [];

export const App: React.FC = () => {
  // Service health state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [healthState, setHealthState] = useState<'checking' | 'healthy' | 'offline'>('checking');

  // Capture & Block review state
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [originalBlocks, setOriginalBlocks] = useState<Block[]>([]);
  const [captureStatus, setCaptureStatus] = useState<
    'idle' | 'capturing' | 'success' | 'error' | 'restricted'
  >('idle');
  const [activeMode, setActiveMode] = useState<CaptureMode | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [restrictedUrl, setRestrictedUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'blocks' | 'markdown' | 'chunks' | 'retrieve' | 'debugger' | 'export'>('blocks');
  const [allChunks, setAllChunks] = useState<Chunk[]>(EMPTY_CHUNKS);
  const [recursiveChunks, setRecursiveChunks] = useState<Chunk[]>(EMPTY_CHUNKS);
  const [headingChunks, setHeadingChunks] = useState<Chunk[]>(EMPTY_CHUNKS);
  const [highlightedBlockIds, setHighlightedBlockIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Check health of local FastAPI backend
  const checkHealth = async () => {
    setHealthState('checking');
    try {
      const [healthRes, versionRes] = await Promise.all([
        fetch(`${SERVICE_URL}/health`),
        fetch(`${SERVICE_URL}/version`),
      ]);

      if (!healthRes.ok || !versionRes.ok) {
        throw new Error('Service health check failed');
      }

      const healthData: HealthResponse = await healthRes.json();
      const versionData: VersionResponse = await versionRes.json();

      setHealth(healthData);
      setVersion(versionData);
      setHealthState('healthy');
    } catch {
      setHealthState('offline');
    }
  };

  // Load draft on mount & setup runtime message listeners
  useEffect(() => {
    void checkHealth();

    // Restore draft capture if saved in local storage
    void loadDraftCapture().then((savedDraft) => {
      if (savedDraft && savedDraft.blocks) {
        setCaptureResult(savedDraft);
        setOriginalBlocks(savedDraft.blocks.map((b: Block) => ({ ...b })));
        setCaptureStatus('success');
      }
    });

    // Listen for async messages from Element Picker in content script
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const messageListener = (message: any): boolean => {
        if (message.type === 'WEBRAG_CAPTURE_COMPLETE' && message.result) {
          const res = message.result as CaptureResult;
          setCaptureResult(res);
          setOriginalBlocks(res.blocks.map((b: Block) => ({ ...b })));
          setCaptureStatus('success');
          setHighlightedBlockIds(new Set());
          setActiveMode(null);
          void saveDraftCapture(res);
        } else if (message.type === 'WEBRAG_PICKER_CANCELLED') {
          setCaptureStatus((prev) => (prev === 'capturing' ? 'idle' : prev));
          setActiveMode(null);
        } else if (message.type === 'WEBRAG_CAPTURE_ERROR') {
          setCaptureStatus('error');
          setErrorDetails(message.error || 'Element capture failed');
          setActiveMode(null);
        }
        return false;
      };

      chrome.runtime.onMessage.addListener(messageListener);
      return () => {
        chrome.runtime.onMessage.removeListener(messageListener);
      };
    }
    return undefined;
  }, []);

  const currentBlocks = captureResult?.blocks ?? EMPTY_BLOCKS;

  // Keep chunks updated whenever capture blocks change
  useEffect(() => {
    if (!captureResult || currentBlocks.length === 0) {
      setRecursiveChunks(EMPTY_CHUNKS);
      setHeadingChunks(EMPTY_CHUNKS);
      setAllChunks(EMPTY_CHUNKS);
      return;
    }

    let cancelled = false;
    void chunkBothStrategies(
      currentBlocks,
      captureResult.capture.id,
      { maxCharacters: 700, overlapCharacters: 80 },
      { maxCharacters: 700 }
    ).then((res) => {
      if (cancelled) return;
      setRecursiveChunks(res.recursive);
      setHeadingChunks(res.headingAware);
      setAllChunks([...res.recursive, ...res.headingAware]);
    }).catch(() => {
      if (cancelled) return;
      setRecursiveChunks(EMPTY_CHUNKS);
      setHeadingChunks(EMPTY_CHUNKS);
      setAllChunks(EMPTY_CHUNKS);
    });

    return () => {
      cancelled = true;
    };
  }, [captureResult, currentBlocks]);

  // Initiate a new capture
  const handleStartCapture = async (mode: CaptureMode) => {
    setActiveMode(mode);
    setCaptureStatus('capturing');
    setErrorDetails(null);
    setRestrictedUrl(null);

    try {
      const result = await requestCapture(mode);
      if (result) {
        setCaptureResult(result);
        setOriginalBlocks(result.blocks.map((b: Block) => ({ ...b })));
        setCaptureStatus('success');
        setHighlightedBlockIds(new Set());
        setActiveMode(null);
        void saveDraftCapture(result);
      }
    } catch (err: any) {
      if (err instanceof RestrictedTabError) {
        setCaptureStatus('restricted');
        setRestrictedUrl(err.url);
      } else {
        setCaptureStatus('error');
        setErrorDetails(err.message || 'Capture failed.');
      }
      setActiveMode(null);
    }
  };

  // Block inclusion state mutations
  const updateBlocksState = (newBlocks: Block[]) => {
    if (!captureResult) return;
    const updatedResult: CaptureResult = {
      ...captureResult,
      blocks: newBlocks,
    };
    setCaptureResult(updatedResult);
    void saveDraftCapture(updatedResult);
  };

  const handleToggleBlock = (blockId: string) => {
    if (!captureResult) return;
    const newBlocks = captureResult.blocks.map((b: Block) =>
      b.id === blockId ? { ...b, included: b.included === false ? true : false } : b
    );
    updateBlocksState(newBlocks);
  };

  const handleIncludeAll = () => {
    if (!captureResult) return;
    const newBlocks = captureResult.blocks.map((b: Block) => ({ ...b, included: true }));
    updateBlocksState(newBlocks);
  };

  const handleExcludeAll = () => {
    if (!captureResult) return;
    const newBlocks = captureResult.blocks.map((b: Block) => ({ ...b, included: false }));
    updateBlocksState(newBlocks);
  };

  const handleRestoreOriginal = () => {
    if (!captureResult || originalBlocks.length === 0) return;
    const restoredBlocks = originalBlocks.map((b: Block) => ({ ...b }));
    updateBlocksState(restoredBlocks);
  };

  const handleClearDraft = async () => {
    await clearDraftCapture();
    setCaptureResult(null);
    setOriginalBlocks([]);
    setCaptureStatus('idle');
    setErrorDetails(null);
    setRestrictedUrl(null);
    setHighlightedBlockIds(new Set());
  };

  const handleHighlightBlocks = (blockIds: string[]) => {
    setHighlightedBlockIds(new Set(blockIds));
    setActiveTab('blocks');
  };

  useEffect(() => {
    if (activeTab !== 'blocks' || highlightedBlockIds.size === 0) return;
    const firstBlockId = highlightedBlockIds.values().next().value as string | undefined;
    if (!firstBlockId) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`source-${firstBlockId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, highlightedBlockIds]);

  // Metrics & Cleaned Markdown derived values
  const metrics = useMemo(() => calculateExtractionMetrics(currentBlocks), [currentBlocks]);
  const cleanedMarkdown = useMemo(() => generateCleanedMarkdown(currentBlocks), [currentBlocks]);

  // Derive heading paths for query suggestions
  const headingPaths = useMemo(
    () => currentBlocks.filter((b) => b.included !== false && b.headingPath?.length).map((b) => b.headingPath),
    [currentBlocks]
  );

  const blocksMap = useMemo(() => {
    const map = new Map<string, Block>();
    currentBlocks.forEach((b) => map.set(b.id, b));
    return map;
  }, [currentBlocks]);

  return (
    <div className="container">
      {/* Extension Header */}
      <header className="header">
        <div className="logo-group">
          <div className="logo-icon">W</div>
          <h1 className="title">WebRAG Studio</h1>
        </div>
        <button
          type="button"
          className={`status-badge status-${healthState}`}
          onClick={checkHealth}
          title={
            health && version
              ? `Backend v${health.version} (API v${version.apiVersion}, Schema v${health.schemaVersion})`
              : 'Click to refresh service status'
          }
        >
          <span className="status-dot"></span>
          <span>{healthState.toUpperCase()}</span>
        </button>
      </header>

      {/* Capture Mode Triggers */}
      <CaptureControls
        onCapture={handleStartCapture}
        isCapturing={captureStatus === 'capturing'}
        activeMode={activeMode}
        hasCapture={Boolean(captureResult)}
        onClear={handleClearDraft}
      />

      {/* Conditional Status Views (Restricted Page or Failure Error) */}
      {captureStatus === 'restricted' && restrictedUrl && (
        <RestrictedPageState url={restrictedUrl} />
      )}

      {captureStatus === 'error' && errorDetails && (
        <ErrorState
          message={errorDetails}
          onRetry={() => activeMode && handleStartCapture(activeMode)}
          onClear={handleClearDraft}
        />
      )}

      {/* Main Review & Cleaned Markdown View */}
      {captureStatus === 'success' && captureResult && (
        <>
          <ExtractionSummary
            metrics={metrics}
            url={captureResult.capture.url}
            title={captureResult.capture.title}
            mode={captureResult.capture.mode}
            timestamp={captureResult.capture.timestamp}
          />

          <nav className="tabs-header">
            <button
              className={`tab-btn ${activeTab === 'blocks' ? 'active' : ''}`}
              onClick={() => setActiveTab('blocks')}
            >
              Blocks ({metrics.includedBlocks}/{metrics.totalBlocks})
            </button>
            <button
              className={`tab-btn ${activeTab === 'markdown' ? 'active' : ''}`}
              onClick={() => setActiveTab('markdown')}
            >
              Cleaned Markdown Preview
            </button>
            <button
              className={`tab-btn ${activeTab === 'chunks' ? 'active' : ''}`}
              onClick={() => setActiveTab('chunks')}
            >
              Compare Chunks
            </button>
            <button
              className={`tab-btn ${activeTab === 'retrieve' ? 'active' : ''}`}
              onClick={() => setActiveTab('retrieve')}
            >
              Semantic Search ({allChunks.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'debugger' ? 'active' : ''}`}
              onClick={() => setActiveTab('debugger')}
            >
              🎯 Debugger
            </button>
            <button
              className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`}
              onClick={() => setActiveTab('export')}
            >
              📦 Export
            </button>
          </nav>

          {activeTab === 'blocks' ? (
            <BlockTree
              blocks={currentBlocks}
              onToggleBlock={handleToggleBlock}
              onIncludeAll={handleIncludeAll}
              onExcludeAll={handleExcludeAll}
              onRestoreOriginal={handleRestoreOriginal}
              highlightedBlockIds={highlightedBlockIds}
              onClearHighlight={() => setHighlightedBlockIds(new Set())}
            />
          ) : activeTab === 'markdown' ? (
            <CleanedMarkdownPreview
              markdown={cleanedMarkdown}
              includedCount={metrics.includedBlocks}
              totalCount={metrics.totalBlocks}
            />
          ) : activeTab === 'chunks' ? (
            <ChunkComparison
              blocks={currentBlocks}
              sourceNamespace={captureResult.capture.id}
              onHighlightBlocks={handleHighlightBlocks}
            />
          ) : activeTab === 'retrieve' ? (
            <RetrievalView
              chunks={allChunks}
              blocksMap={blocksMap}
              headingPaths={headingPaths}
              onInspectBlock={(blockId) => handleHighlightBlocks([blockId])}
              onInspectChunk={() => setActiveTab('chunks')}
            />
          ) : activeTab === 'debugger' ? (
            <RetrievalDebugger
              captureResult={captureResult}
              recursiveChunks={recursiveChunks}
              headingChunks={headingChunks}
            />
          ) : (
            <ExportPackagePanel
              captureResult={captureResult}
              chunks={allChunks}
            />
          )}
        </>
      )}

      {/* Empty State when no capture is active */}
      {captureStatus === 'idle' && !captureResult && (
        <EmptyState onStartCapture={handleStartCapture} />
      )}
    </div>
  );
};
