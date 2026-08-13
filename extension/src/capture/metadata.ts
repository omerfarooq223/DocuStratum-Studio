import { EXTRACTOR_VERSION } from './constants';
import { sha256, stableStringify } from './hash';
import type { Block, Capture, CaptureEnvironment, CaptureMode } from './types';

function resolveCanonicalUrl(document: Document, pageUrl: string): string | undefined {
  const href = document.querySelector<HTMLLinkElement>('link[rel~="canonical"][href]')?.getAttribute('href');
  if (!href) return undefined;

  try {
    const canonical = new URL(href, pageUrl);
    if (canonical.protocol === 'http:' || canonical.protocol === 'https:') return canonical.href;
  } catch {
    // A malformed canonical URL is untrusted page data; ignore it.
  }
  return undefined;
}

export function sourceUrl(environment: CaptureEnvironment): string {
  const raw = environment.url ?? environment.document.location?.href;
  if (!raw) throw new Error('Cannot capture a page without a source URL.');
  const url = new URL(raw);
  url.hash = '';
  return url.href;
}

export async function createCaptureMetadata(
  mode: CaptureMode,
  blocks: readonly Block[],
  environment: CaptureEnvironment,
): Promise<Capture> {
  const url = sourceUrl(environment);
  const contentHash = await sha256(
    stableStringify(
      blocks.map(({ type, content, headingPath, contentHash: blockHash, attributes }) => ({
        type,
        content,
        headingPath,
        contentHash: blockHash,
        attributes,
      })),
    ),
  );
  const canonicalUrl = resolveCanonicalUrl(environment.document, url);
  return {
    id: `cap_${contentHash.slice(0, 24)}`,
    url,
    ...(canonicalUrl ? { canonicalUrl } : {}),
    title: environment.document.title.trim() || url,
    mode,
    timestamp: (environment.now?.() ?? new Date()).toISOString(),
    extractorVersion: EXTRACTOR_VERSION,
    contentHash,
  };
}
