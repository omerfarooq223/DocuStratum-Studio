import React from 'react';
import { Block } from '../../../../packages/schema';
import { BlockItem } from './BlockItem';

interface BlockTreeProps {
  blocks: Block[];
  onToggleBlock: (blockId: string) => void;
  onIncludeAll: () => void;
  onExcludeAll: () => void;
  onRestoreOriginal: () => void;
  highlightedBlockIds?: ReadonlySet<string>;
  onClearHighlight?: () => void;
}

const EMPTY_HIGHLIGHTS: ReadonlySet<string> = new Set();

export const BlockTree: React.FC<BlockTreeProps> = ({
  blocks,
  onToggleBlock,
  onIncludeAll,
  onExcludeAll,
  onRestoreOriginal,
  highlightedBlockIds = EMPTY_HIGHLIGHTS,
  onClearHighlight,
}) => {
  return (
    <div className="block-tree-card">
      <div className="block-tree-toolbar">
        <div className="tree-toolbar-info">
          <span className="section-label">EXTRACTED BLOCK TREE</span>
          <span className="tree-count-badge">{blocks.length} blocks</span>
        </div>

        <div className="bulk-action-group">
          <button className="btn-bulk" onClick={onIncludeAll} title="Include all blocks">
            Include All
          </button>
          <button className="btn-bulk" onClick={onExcludeAll} title="Exclude all blocks">
            Exclude All
          </button>
          <button
            className="btn-bulk btn-restore"
            onClick={onRestoreOriginal}
            title="Restore original extraction state"
          >
            Restore Original
          </button>
        </div>
      </div>

      {highlightedBlockIds.size > 0 ? (
        <div className="source-highlight-banner" role="status">
          <span>Highlighted from chunk: {highlightedBlockIds.size} source block(s)</span>
          {onClearHighlight ? (
            <button type="button" onClick={onClearHighlight}>Clear</button>
          ) : null}
        </div>
      ) : null}

      <div className="block-list">
        {blocks.map((block, idx) => (
          <BlockItem
            key={block.id}
            block={block}
            index={idx}
            onToggle={onToggleBlock}
            highlighted={highlightedBlockIds.has(block.id)}
          />
        ))}
      </div>
    </div>
  );
};
