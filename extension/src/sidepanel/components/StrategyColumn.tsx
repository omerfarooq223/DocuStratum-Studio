import type { Chunk } from '../../../../packages/schema';
import type { ChunkMetrics } from '../../chunking/metrics';
import { ChunkCard } from './ChunkCard';
import { SizeDistribution } from './SizeDistribution';

interface StrategyColumnProps {
  name: string;
  description: string;
  accent: 'blue' | 'purple';
  chunks: readonly Chunk[];
  metrics: ChunkMetrics;
  maximum: number;
  blockIndexById: ReadonlyMap<string, number>;
  onHighlightBlocks: (blockIds: string[]) => void;
}

export function StrategyColumn({
  name,
  description,
  accent,
  chunks,
  metrics,
  maximum,
  blockIndexById,
  onHighlightBlocks,
}: StrategyColumnProps) {
  return (
    <section className={`strategy-column strategy-${accent}`} aria-label={`${name} chunks`}>
      <header className="strategy-header">
        <div>
          <h3>{name}</h3>
          <p>{description}</p>
        </div>
        <span className="strategy-count">{metrics.chunkCount}</span>
      </header>

      <div className="strategy-metrics">
        <span><strong>{metrics.minCharacters}</strong> min</span>
        <span><strong>{metrics.medianCharacters}</strong> median</span>
        <span><strong>{metrics.maxCharacters}</strong> max</span>
        <span><strong>{metrics.overlapCharacters}</strong> overlap</span>
      </div>
      <SizeDistribution sizes={metrics.sizeDistribution} maximum={maximum} />

      <div className="chunk-list">
        {chunks.map((chunk) => (
          <ChunkCard
            key={chunk.id}
            chunk={chunk}
            blockIndexById={blockIndexById}
            onHighlightBlocks={onHighlightBlocks}
          />
        ))}
      </div>
    </section>
  );
}

