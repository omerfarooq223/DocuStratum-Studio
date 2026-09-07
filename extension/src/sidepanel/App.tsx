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
import { Footer } from './components/Footer';
import { LegalComplianceModal, LegalPolicyTab } from './components/LegalComplianceModal';
import { DEMO_CAPTURE } from './utils/demoData';

const SERVICE_URL = 'http://127.0.0.1:8000';
const EMPTY_BLOCKS: Block[] = [];
const EMPTY_CHUNKS: Chunk[] = [];

export const App: React.FC = () => {
  // Service health state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [version, setVersion] = useState<VersionResponse | null>(null);
  const [healthState, setHealthState] = useState<'checking' | 'healthy' | 'offline'>('checking');

  // Legal modal state
  const [isLegalModalOpen, setIsLegalModalOpen] = useState<boolean>(false);
  const [legalActiveTab, setLegalActiveTab] = useState<LegalPolicyTab>('privacy');

  const handleOpenLegal = (tab: LegalPolicyTab) => {
    setLegalActiveTab(tab);
    setIsLegalModalOpen(true);
  };

  // Capture & Block review state
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [originalBlocks, setOriginalBlocks] = useState<Block[]>([]);
  const [captureStatus, setCaptureStatus] = useState<
    'idle' | 'capturing' | 'success' | 'error' | 'restricted'
  >('idle');
  const [activeMode, setActiveMode] = useState<CaptureMode | null>(null);
  const [failedMode, setFailedMode] = useState<CaptureMode | null>(null);
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
    setFailedMode(null);

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
        setFailedMode(mode);
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
    setFailedMode(null);
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

  const handleLoadDemo = () => {
    setCaptureResult(DEMO_CAPTURE);
    setOriginalBlocks(DEMO_CAPTURE.blocks.map((b: Block) => ({ ...b })));
    setCaptureStatus('success');
    setHighlightedBlockIds(new Set());
    setActiveMode(null);
    void saveDraftCapture(DEMO_CAPTURE);
  };

  const [isFullTab, setIsFullTab] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('mode') === 'tab' || window.innerWidth > 768;
  });

  useEffect(() => {
    const handleResize = () => {
      const urlParams = new URLSearchParams(window.location.search);
      setIsFullTab(urlParams.get('mode') === 'tab' || window.innerWidth > 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOpenFullTab = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create && chrome.runtime?.getURL) {
      void chrome.tabs.create({
        url: chrome.runtime.getURL('src/sidepanel/index.html?mode=tab'),
      });
    } else {
      window.open(window.location.pathname + '?mode=tab', '_blank');
    }
  };

  return (
    <div className="container">
      {/* Skip to Main Content Link for Keyboard Accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Extension Header */}
      <header className="header" role="banner">
        <div className="logo-group">
          <div className="logo-icon" aria-hidden="true">D</div>
          <h1 className="title">DocuStratum Studio</h1>
        </div>
        <div className="header-actions">
          {!isFullTab && (
            <button
              type="button"
              className="btn-tab-mode"
              onClick={handleOpenFullTab}
              title="Open DocuStratum Studio in a separate browser tab for widescreen analysis"
            >
              ↗ Full Tab
            </button>
          )}
          {isFullTab && (
            <span className="badge-tab-mode" title="DocuStratum Studio is running in Full Tab Dashboard mode">
              Full Tab Mode
            </span>
          )}
          <button
            type="button"
            className={`status-badge status-${healthState}`}
            onClick={checkHealth}
            title={
              health && version
                ? `Backend v${health.version} (API v${version.apiVersion}, Schema v${health.schemaVersion})`
                : 'Click to refresh service status'
            }
            aria-label={`Companion service status: ${healthState}`}
          >
            <span className="status-dot"></span>
            <span>{healthState.toUpperCase()}</span>
          </button>
        </div>
      </header>

      {/* Main Semantic Landmark */}
      <main id="main-content" tabIndex={-1} style={{ outline: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
            onRetry={() => failedMode && handleStartCapture(failedMode)}
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
              onOpenFullTab={isFullTab ? undefined : handleOpenFullTab}
            />

            <nav className="tabs-header" aria-label="Analysis Tabs">
              <button
                type="button"
                id="tab-blocks"
                aria-pressed={activeTab === 'blocks'}
                className={`tab-btn ${activeTab === 'blocks' ? 'active' : ''}`}
                onClick={() => setActiveTab('blocks')}
              >
                Blocks ({metrics.includedBlocks}/{metrics.totalBlocks})
              </button>
              <button
                type="button"
                id="tab-markdown"
                aria-pressed={activeTab === 'markdown'}
                className={`tab-btn ${activeTab === 'markdown' ? 'active' : ''}`}
                onClick={() => setActiveTab('markdown')}
              >
                Cleaned Markdown Preview
              </button>
              <button
                type="button"
                id="tab-chunks"
                aria-pressed={activeTab === 'chunks'}
                className={`tab-btn ${activeTab === 'chunks' ? 'active' : ''}`}
                onClick={() => setActiveTab('chunks')}
              >
                Compare Chunks
              </button>
              <button
                type="button"
                id="tab-retrieve"
                aria-pressed={activeTab === 'retrieve'}
                className={`tab-btn ${activeTab === 'retrieve' ? 'active' : ''}`}
                onClick={() => setActiveTab('retrieve')}
              >
                Semantic Search ({allChunks.length})
              </button>
              <button
                type="button"
                id="tab-debugger"
                aria-pressed={activeTab === 'debugger'}
                className={`tab-btn ${activeTab === 'debugger' ? 'active' : ''}`}
                onClick={() => setActiveTab('debugger')}
              >
                Retrieval Debugger
              </button>
              <button
                type="button"
                id="tab-export"
                aria-pressed={activeTab === 'export'}
                className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`}
                onClick={() => setActiveTab('export')}
              >
                Export Package
              </button>
            </nav>

            <div
              id={`tabpanel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`tab-${activeTab}`}
              className="tab-content-container"
            >
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
            </div>
          </>
        )}

        {/* Empty State when no capture is active */}
        {captureStatus === 'idle' && !captureResult && (
          <EmptyState onStartCapture={handleStartCapture} onLoadDemo={handleLoadDemo} />
        )}
      </main>

      {/* Semantic Footer with Legal Navigation */}
      <Footer onOpenLegal={handleOpenLegal} />

      {/* Accessible Legal & Compliance Modal */}
      <LegalComplianceModal
        isOpen={isLegalModalOpen}
        activeTab={legalActiveTab}
        onTabChange={setLegalActiveTab}
        onClose={() => setIsLegalModalOpen(false)}
      />
    </div>
  );
};
