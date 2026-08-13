const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'NAV',
  'FORM',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'BUTTON',
  'DATALIST',
  'OUTPUT',
  'LABEL',
  'FIELDSET',
  'LEGEND',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'CANVAS',
  'SVG',
  'FOOTER',
]);

const EXCLUDED_ROLES = new Set([
  'button',
  'menu',
  'menubar',
  'menuitem',
  'navigation',
  'search',
  'tab',
  'tablist',
  'toolbar',
]);

const REPEATED_UI_PATTERN = /(^|[-_\s])(breadcrumb|cookie|consent|masthead|pagination|sidebar|site[-_]?header|site[-_]?footer|social[-_]?share|table[-_]?of[-_]?contents|toc|toolbar)([-_\s]|$)/i;

export function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function isEditable(element: Element): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return true;
  }

  for (let current: Element | null = element; current; current = current.parentElement) {
    const editable = current.getAttribute('contenteditable');
    if (editable !== null && editable.toLowerCase() !== 'false') {
      return true;
    }
  }
  return false;
}

export function isHidden(element: Element): boolean {
  if (element.hasAttribute('hidden') || element.hasAttribute('inert')) {
    return true;
  }
  if (element.getAttribute('aria-hidden')?.toLowerCase() === 'true') {
    return true;
  }
  if (element instanceof HTMLInputElement && element.type.toLowerCase() === 'hidden') {
    return true;
  }

  const view = element.ownerDocument.defaultView;
  if (!view) return false;

  try {
    const style = view.getComputedStyle(element);
    return (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0'
    );
  } catch {
    return false;
  }
}

function isRepeatedUi(element: Element): boolean {
  const role = element.getAttribute('role')?.toLowerCase();
  if (role && EXCLUDED_ROLES.has(role)) return true;

  const marker = `${element.id} ${element.className}`;
  return REPEATED_UI_PATTERN.test(marker);
}

export function isExcludedElement(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (EXCLUDED_TAGS.has(current.tagName)) return true;
    if (current.hasAttribute('data-webrag-exclude')) return true;
    if (isEditable(current) || isHidden(current) || isRepeatedUi(current)) return true;
  }
  return false;
}

export function safeText(node: Node, shouldSkip?: (element: Element) => boolean): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue ?? '';
  }
  if (!(node instanceof Element) || isExcludedElement(node) || shouldSkip?.(node)) {
    return '';
  }
  if (node.tagName === 'BR') return '\n';
  if (node.tagName === 'IMG') return node.getAttribute('alt') ?? '';

  return Array.from(node.childNodes, (child) => safeText(child, shouldSkip)).join(' ');
}

export function safeNormalizedText(node: Node, shouldSkip?: (element: Element) => boolean): string {
  return normalizeWhitespace(safeText(node, shouldSkip));
}
