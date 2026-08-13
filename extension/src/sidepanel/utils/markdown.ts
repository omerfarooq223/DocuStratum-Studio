import { Block } from '../../../../packages/schema';

/**
 * Converts an array of extracted DOM blocks into clean, structured Markdown text.
 * Only blocks with `included === true` (or not explicitly excluded) are rendered.
 */
export function generateCleanedMarkdown(blocks: Block[]): string {
  const includedBlocks = blocks.filter((b: Block) => b.included !== false);

  if (includedBlocks.length === 0) {
    return '';
  }

  const markdownParts: string[] = [];

  for (const block of includedBlocks) {
    const part = formatBlockToMarkdown(block);
    if (part) {
      markdownParts.push(part);
    }
  }

  return markdownParts.join('\n\n');
}

function formatBlockToMarkdown(block: Block): string {
  const content = block.content.trim();
  if (!content && block.type !== 'table') {
    return '';
  }

  switch (block.type) {
    case 'heading': {
      const level = Math.min(
        6,
        Math.max(1, block.attributes?.headingLevel || block.headingPath.length || 2)
      );
      const prefix = '#'.repeat(level);
      return `${prefix} ${content}`;
    }

    case 'paragraph': {
      return content;
    }

    case 'list': {
      const listKind = block.attributes?.listKind || 'unordered';
      const lines = content.split('\n').map((line: string) => line.trim()).filter(Boolean);
      
      return lines
        .map((line: string, idx: number) => {
          if (/^(\*|-|\+|\d+\.)\s/.test(line)) {
            return line;
          }
          const bullet = listKind === 'ordered' ? `${idx + 1}.` : '-';
          return `${bullet} ${line}`;
        })
        .join('\n');
    }

    case 'code': {
      const lang = block.attributes?.codeLanguage || '';
      return `\`\`\`${lang}\n${content}\n\`\`\``;
    }

    case 'table': {
      const headers = block.attributes?.tableHeaders;
      const rows = block.attributes?.tableRows;

      if (headers && headers.length > 0) {
        const headerLine = `| ${headers.map((h: string) => h.replace(/\|/g, '\\|')).join(' | ')} |`;
        const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`;
        
        let tableStr = `${headerLine}\n${separatorLine}`;

        if (rows && rows.length > 0) {
          const rowLines = rows.map(
            (row: string[]) => `| ${row.map((cell: string) => cell.replace(/\|/g, '\\|')).join(' | ')} |`
          );
          tableStr += `\n${rowLines.join('\n')}`;
        }

        return tableStr;
      }

      return content;
    }

    case 'callout': {
      const kind = (block.attributes?.calloutKind || 'NOTE').toUpperCase();
      const formattedLines = content
        .split('\n')
        .map((line: string) => `> ${line}`)
        .join('\n');
      return `> [!${kind}]\n${formattedLines}`;
    }

    default:
      return content;
  }
}
