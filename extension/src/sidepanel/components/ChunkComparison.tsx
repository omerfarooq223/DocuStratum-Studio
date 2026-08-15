import { useEffect, useMemo, useState } from 'react';
import type { Block, Chunk } from '../../../../packages/schema';
import { chunkBothStrategies } from '../../chunking';
import { calculateChunkMetrics } from '../../chunking/metrics';
import { MAX_CHUNK_CHARACTERS, MIN_CHUNK_CHARACTERS } from '../../chunking/common';
import { StrategyColumn } from './StrategyColumn';

interface ChunkComparisonProps {
  blocks: readonly Block[];
  sourceNamespace: string;
  onHighlightBlocks: (blockIds: string[]) => void;
}

type FocusMode = 'both' | 'recursive' | 'heading';

const DEFAULT_MAX_CHARACTERS = 700;
const DEFAULT_OVERLAP_CHARACTERS = 80;
const EMPTY_CHUNKS: Chunk[] = [];
const FOCUS_MODES: readonly FocusMode[] = ['both', 'recursive', 'heading'];

export function ChunkComparison({
  blocks,
  sourceNamespace,
  onHighlightBlocks,
}: ChunkComparisonProps) {
  const [maximum, setMaximum] = useState(DEFAULT_MAX_CHARACTERS);
  const [overlap, setOverlap] = useState(DEFAULT_OVERLAP_CHARACTERS);
  const [focus, setFocus] = useState<FocusMode>('both');
  const [recursiveChunks, setRecursiveChunks] = useState<Chunk[]>(EMPTY_CHUNKS);
  const [headingChunks, setHeadingChunks] = useState<Chunk[]>(EMPTY_CHUNKS);
  const [status, setStatus] = useState<'working' | 'ready' | 'error'>('working');
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setStatus('working');
    setError(undefined);
    void chunkBothStrategies(
      blocks,
      sourceNamespace,
      { maxCharacters: maximum, overlapCharacters: overlap },
      { maxCharacters: maximum },
    )
      .then((result) => {
        if (cancelled) return;
        setRecursiveChunks(result.recursive);
        setHeadingChunks(result.headingAware);
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [blocks, sourceNamespace, maximum, overlap]);

  const blockIndexById = useMemo(
    () => new Map(blocks.map((block, index) => [block.id, index])),
    [blocks],
  );
  const recursiveMetrics = useMemo(
    () => calculateChunkMetrics(recursiveChunks),
    [recursiveChunks],
  );
  const headingMetrics = useMemo(
    () => calculateChunkMetrics(headingChunks),
    [headingChunks],
  );
  const includedCount = blocks.reduce(
    (count, block) => count + (block.included === false ? 0 : 1),
    0,
  );

  const changeMaximum = (value: number): void => {
    if (!Number.isInteger(value) || value < MIN_CHUNK_CHARACTERS || value > MAX_CHUNK_CHARACTERS) {
      return;
    }
    setMaximum(value);
    setOverlap((current) => Math.min(current, value - 1));
  };

  const changeOverlap = (value: number): void => {
    if (!Number.isInteger(value) || value < 0 || value >= maximum) return;
    setOverlap(value);
  };

  return (
    <div className="chunk-comparison-card">
      <header className="chunk-comparison-header">
        <div>
          <span className="section-label">DETERMINISTIC CHUNK COMPARISON</span>
          <p className="chunk-explainer">
            Recursive makes even overlapping windows. Heading-aware keeps sections and blocks together.
          </p>
        </div>
        <span className="chunk-source-count">{includedCount} source blocks</span>
      </header>

      <div className="chunk-settings" aria-label="Chunk settings">
        <label>
          Max characters
          <input
            type="number"
            min={MIN_CHUNK_CHARACTERS}
            max={MAX_CHUNK_CHARACTERS}
            value={maximum}
            onChange={(event) => changeMaximum(Number(event.target.value))}
          />
        </label>
        <label>
          Recursive overlap
          <input
            type="number"
            min={0}
            max={maximum - 1}
            value={overlap}
            onChange={(event) => changeOverlap(Number(event.target.value))}
          />
        </label>
        <div className="chunk-focus-toggle" aria-label="Visible strategies">
          {FOCUS_MODES.map((mode) => (
            <button
              type="button"
              key={mode}
              className={focus === mode ? 'active' : ''}
              aria-pressed={focus === mode}
              onClick={() => setFocus(mode)}
            >
              {mode === 'heading' ? 'Heading-aware' : mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {status === 'working' ? <div className="chunk-status">Recomputing identical IDs…</div> : null}
      {status === 'error' ? <div className="chunk-error" role="alert">{error}</div> : null}
      {status === 'ready' ? (
        <div className={`strategy-grid focus-${focus}`}>
          {focus !== 'heading' ? (
            <StrategyColumn
              name="Recursive"
              description={`${overlap}-character declared overlap`}
              accent="blue"
              chunks={recursiveChunks}
              metrics={recursiveMetrics}
              maximum={maximum}
              blockIndexById={blockIndexById}
              onHighlightBlocks={onHighlightBlocks}
            />
          ) : null}
          {focus !== 'recursive' ? (
            <StrategyColumn
              name="Heading-aware"
              description="Section boundaries, zero overlap"
              accent="purple"
              chunks={headingChunks}
              metrics={headingMetrics}
              maximum={maximum}
              blockIndexById={blockIndexById}
              onHighlightBlocks={onHighlightBlocks}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
