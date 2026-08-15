interface SizeDistributionProps {
  sizes: readonly number[];
  maximum: number;
}

export function SizeDistribution({ sizes, maximum }: SizeDistributionProps) {
  if (!sizes.length) return <div className="chunk-distribution-empty">No chunks</div>;

  return (
    <div
      className="chunk-distribution"
      aria-label={`Chunk sizes: ${sizes.join(', ')} characters`}
    >
      {sizes.map((size, index) => (
        <span
          className="chunk-size-bar"
          key={`${index}-${size}`}
          style={{ height: `${Math.max(8, Math.round((size / maximum) * 100))}%` }}
          title={`Chunk ${index + 1}: ${size} characters`}
        />
      ))}
    </div>
  );
}

