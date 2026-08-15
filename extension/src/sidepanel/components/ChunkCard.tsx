import type { Chunk } from '../../../../packages/schema';

interface ChunkCardProps {
  chunk: Chunk;
  blockIndexById: ReadonlyMap<string, number>;
  onHighlightBlocks: (blockIds: string[]) => void;
}

function continuationLabel(chunk: Chunk): string | undefined {
  const continuation = chunk.continuations?.[0];
  if (!continuation) return undefined;
  const extra = (chunk.continuations?.length ?? 0) - 1;
  return `${continuation.blockType} ${continuation.part}/${continuation.totalParts}${extra > 0 ? ` +${extra}` : ''}`;
}

export function ChunkCard({ chunk, blockIndexById, onHighlightBlocks }: ChunkCardProps) {
  const relationLabels = chunk.sourceBlockIds.map((blockId) => {
    const index = blockIndexById.get(blockId);
    return index === undefined ? blockId.slice(0, 8) : `B${index + 1}`;
  });
  const continuation = continuationLabel(chunk);

  return (
    <button
      className="chunk-card"
      type="button"
      onClick={() => onHighlightBlocks(chunk.sourceBlockIds)}
      aria-label={`Chunk ${chunk.sequence + 1}, highlight ${chunk.sourceBlockIds.length} source blocks`}
    >
      <span className="chunk-card-header">
        <span className="chunk-sequence">#{chunk.sequence + 1}</span>
        <span className="chunk-size">{chunk.characterCount} chars</span>
        <span className="chunk-tokens">~{chunk.tokenCount} tokens</span>
      </span>

      {chunk.headingPath.length > 0 ? (
        <span className="chunk-heading-path" title={chunk.headingPath.join(' > ')}>
          {chunk.headingPath.join(' › ')}
        </span>
      ) : (
        <span className="chunk-heading-path muted">No heading context</span>
      )}

      <span className="chunk-content-preview">{chunk.content}</span>

      <span className="chunk-card-footer">
        <span className="chunk-relations" aria-label="Contributing source blocks">
          {relationLabels.map((label) => (
            <span className="block-relation-chip" key={label}>{label}</span>
          ))}
        </span>
        {chunk.overlap ? (
          <span className="chunk-overlap-badge">
            ↩ {chunk.overlap.characterCount} overlap
          </span>
        ) : null}
        {continuation ? (
          <span className="chunk-continuation-badge">↳ {continuation}</span>
        ) : null}
      </span>
    </button>
  );
}

