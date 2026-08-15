const TOKEN_PATTERN = /[\p{L}\p{M}\p{N}_]+(?:['’.-][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu;

export function countCharacters(value: string): number {
  return Array.from(value).length;
}

export function countTokens(value: string): number {
  return value.match(TOKEN_PATTERN)?.length ?? 0;
}

export function offsetAfterCharacters(value: string, startOffset: number, count: number): number {
  let offset = startOffset;
  let consumed = 0;
  while (offset < value.length && consumed < count) {
    const codePoint = value.codePointAt(offset);
    offset += codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
    consumed += 1;
  }
  return offset;
}

export function offsetBeforeCharacters(value: string, endOffset: number, count: number): number {
  let offset = endOffset;
  let consumed = 0;
  while (offset > 0 && consumed < count) {
    offset -= 1;
    const code = value.charCodeAt(offset);
    if (code >= 0xdc00 && code <= 0xdfff && offset > 0) offset -= 1;
    consumed += 1;
  }
  return offset;
}

