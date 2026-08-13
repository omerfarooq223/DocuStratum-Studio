import React, { useState } from 'react';
import { Block } from '../../../../packages/schema';

interface BlockItemProps {
  block: Block;
  index: number;
  onToggle: (blockId: string) => void;
}

export const BlockItem: React.FC<BlockItemProps> = ({ block, index, onToggle }) => {
  const [expanded, setExpanded] = useState(false);
  const isIncluded = block.included !== false;

  const getTypeBadgeLabel = (): string => {
    if (block.type === 'heading' && block.attributes?.headingLevel) {
      return `H${block.attributes.headingLevel}`;
    }
    const labelMap: Record<string, string> = {
      heading: 'H',
      paragraph: 'P',
      list: 'LIST',
      code: 'CODE',
      table: 'TABLE',
      callout: 'QUOTE',
    };
    return labelMap[block.type] || block.type.toUpperCase();
  };

  const renderContentPreview = () => {
    if (block.type === 'table' && block.attributes?.tableHeaders) {
      const headers = block.attributes.tableHeaders;
      const rows = block.attributes.tableRows || [];
      return (
        <div className="block-table-preview">
          <div className="table-meta">
            Table ({headers.length} cols, {rows.length} rows)
          </div>
          <table className="mini-table">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, expanded ? 10 : 2).map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 2 && (
            <button
              className="btn-text-expand"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Show less' : `+ ${rows.length - 2} more rows`}
            </button>
          )}
        </div>
      );
    }

    if (block.type === 'code') {
      const isLong = block.content.length > 180 || block.content.split('\n').length > 5;
      const displayCode = expanded
        ? block.content
        : block.content.split('\n').slice(0, 4).join('\n');

      return (
        <div className="block-code-preview">
          {block.attributes?.codeLanguage && (
            <span className="code-lang-tag">{block.attributes.codeLanguage}</span>
          )}
          <pre>
            <code>{displayCode}</code>
          </pre>
          {isLong && (
            <button
              className="btn-text-expand"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Collapse code' : 'Expand full code snippet'}
            </button>
          )}
        </div>
      );
    }

    const isLongText = block.content.length > 220;
    const displayText = expanded
      ? block.content
      : isLongText
      ? block.content.slice(0, 220) + '...'
      : block.content;

    return (
      <div className="block-text-preview">
        <p>{displayText}</p>
        {isLongText && (
          <button
            className="btn-text-expand"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show less' : 'Show full text'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={`block-item ${isIncluded ? 'included' : 'excluded'}`}>
      <div className="block-header">
        <div className="block-title-group">
          <span className="block-index">#{index + 1}</span>
          <span className={`block-type-badge type-${block.type}`}>
            {getTypeBadgeLabel()}
          </span>
          {block.headingPath && block.headingPath.length > 0 && (
            <span className="heading-breadcrumb" title={block.headingPath.join(' > ')}>
              {block.headingPath.join(' › ')}
            </span>
          )}
        </div>

        <div className="block-actions">
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={isIncluded}
              onChange={() => onToggle(block.id)}
            />
            <span className="slider round"></span>
            <span className="toggle-label">{isIncluded ? 'Included' : 'Excluded'}</span>
          </label>
        </div>
      </div>

      <div className="block-body">{renderContentPreview()}</div>
    </div>
  );
};
