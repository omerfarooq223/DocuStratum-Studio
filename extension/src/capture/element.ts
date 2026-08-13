import { SEMANTIC_SELECTOR } from './constants';
import { isExcludedElement } from './dom-safety';
import { getHeadingContext } from './headings';
import { createCaptureMetadata, sourceUrl } from './metadata';
import { isSemanticElement, normalizeDom } from './normalize';
import type { CaptureEnvironment, CaptureResult } from './types';

export async function captureElement(
  element: Element,
  environment: CaptureEnvironment,
): Promise<CaptureResult> {
  if (element.ownerDocument !== environment.document) {
    throw new Error('The chosen element does not belong to the active document.');
  }
  if (isExcludedElement(element)) {
    throw new Error('The chosen element is hidden, editable, sensitive, or navigation UI.');
  }

  const captureRoot =
    isSemanticElement(element) || element.querySelector(SEMANTIC_SELECTOR)
      ? element
      : (element.closest(SEMANTIC_SELECTOR) ?? element);
  const blocks = await normalizeDom(captureRoot, {
    sourceUrl: sourceUrl(environment),
    initialHeadingPath: getHeadingContext(captureRoot).path,
  });
  if (!blocks.length) throw new Error('The chosen element contains no safe semantic content.');
  return { capture: await createCaptureMetadata('element', blocks, environment), blocks };
}

export interface ElementPickerCallbacks {
  onCapture: (result: CaptureResult) => void | Promise<void>;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

export class ElementPicker {
  private active = false;
  private hovered?: Element;
  private readonly marker = `data-webrag-picker-${crypto.randomUUID().replaceAll('-', '')}`;
  private readonly styleElement: HTMLStyleElement;

  constructor(
    private readonly environment: CaptureEnvironment,
    private readonly callbacks: ElementPickerCallbacks,
  ) {
    this.styleElement = environment.document.createElement('style');
    this.styleElement.setAttribute('data-webrag-picker-style', '');
    this.styleElement.textContent = `[${this.marker}] { outline: 3px solid #2563eb !important; outline-offset: 2px !important; cursor: crosshair !important; }`;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.environment.document.documentElement.append(this.styleElement);
    this.environment.document.addEventListener('mouseover', this.handleMouseOver, true);
    this.environment.document.addEventListener('mouseout', this.handleMouseOut, true);
    this.environment.document.addEventListener('click', this.handleClick, true);
    this.environment.document.addEventListener('keydown', this.handleKeyDown, true);
  }

  cancel(): void {
    if (!this.active) return;
    this.cleanup();
    this.callbacks.onCancel?.();
  }

  cleanup(): void {
    if (!this.active) return;
    this.active = false;
    this.clearHovered();
    this.styleElement.remove();
    this.environment.document.removeEventListener('mouseover', this.handleMouseOver, true);
    this.environment.document.removeEventListener('mouseout', this.handleMouseOut, true);
    this.environment.document.removeEventListener('click', this.handleClick, true);
    this.environment.document.removeEventListener('keydown', this.handleKeyDown, true);
  }

  isActive(): boolean {
    return this.active;
  }

  private clearHovered(): void {
    this.hovered?.removeAttribute(this.marker);
    this.hovered = undefined;
  }

  private readonly handleMouseOver = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || target === this.styleElement || isExcludedElement(target)) return;
    this.clearHovered();
    this.hovered = target;
    target.setAttribute(this.marker, '');
  };

  private readonly handleMouseOut = (event: MouseEvent): void => {
    if (event.target === this.hovered) this.clearHovered();
  };

  private readonly handleClick = (event: MouseEvent): void => {
    if (!this.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = this.hovered ?? (event.target instanceof Element ? event.target : undefined);
    if (!target || isExcludedElement(target)) return;
    this.cleanup();
    void captureElement(target, this.environment)
      .then(this.callbacks.onCapture)
      .catch((error: unknown) =>
        this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error))),
      );
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancel();
  };
}
