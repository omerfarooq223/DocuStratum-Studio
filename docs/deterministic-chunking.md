# Deterministic Chunking and Strategy Comparison

## 1. File structure and purpose

```text
WebRAG/
├── packages/schema/
│   ├── index.ts                              # Shared settings, Chunk, span, overlap, continuation types
│   └── chunk.json                            # JSON Schema for the complete serialized chunk contract
├── service/
│   ├── models.py                             # Matching Pydantic ChunkModel boundary
│   └── tests/test_chunk_contract.py          # Python-side contract round-trip
├── extension/
│   ├── package.json                          # Focused test:chunking command
│   ├── package-lock.json                     # Reproducible UI test dependency graph
│   └── src/
│       ├── chunking/
│       │   ├── index.ts                      # Public API and parallel two-strategy orchestrator
│       │   ├── unicode.ts                    # Code-point sizing, safe offsets, deterministic token estimate
│       │   ├── common.ts                     # Validation, boundaries, continuations, hashes, stable IDs
│       │   ├── recursive.ts                  # Recursive separator-aware overlapping windows
│       │   ├── heading-aware.ts              # Section/block-preserving strategy
│       │   ├── metrics.ts                    # Counts, min/median/max, overlap, distribution
│       │   └── __tests__/chunking.test.ts    # Boundary, coverage, and ten-run reproducibility tests
│       └── sidepanel/
│           ├── App.tsx                       # Compare tab and chunk-to-source navigation state
│           ├── styles.css                    # Two-column comparison, charts, chunks, source highlight
│           ├── components/
│           │   ├── ChunkComparison.tsx       # Settings, live recomputation, Both/strategy focus toggle
│           │   ├── StrategyColumn.tsx        # Per-strategy metrics, distribution, chunk list
│           │   ├── SizeDistribution.tsx      # Compact accessible size chart
│           │   ├── ChunkCard.tsx             # Content, overlap, continuation, block relationships
│           │   ├── BlockTree.tsx             # Highlight summary and clear action
│           │   └── BlockItem.tsx             # Highlighted source-block presentation and scroll target
│           └── __tests__/
│               ├── chunk-comparison.test.tsx # Comparison, settings, focus, click relationship tests
│               └── sidepanel.test.tsx        # Review-panel multi-block highlight test
├── docs/deterministic-chunking.md            # This design and validation runbook
└── package.json                               # Root test:chunking command
```

All chunking is a pure, browser-local transformation over reviewed blocks. The extension does not need the FastAPI service to compare strategies. The shared JSON/Pydantic contract lets the extension send the chosen chunks to the local embedding service without translating their provenance.

## 2. Complete implementation and component behavior

### Public API

```ts
chunkRecursively(
  blocks,
  sourceNamespace,
  { maxCharacters, overlapCharacters },
): Promise<Chunk[]>

chunkByHeading(
  blocks,
  sourceNamespace,
  { maxCharacters },
): Promise<Chunk[]>

chunkBothStrategies(
  blocks,
  sourceNamespace,
  recursiveSettings,
  headingSettings,
): Promise<{ recursive: Chunk[]; headingAware: Chunk[] }>
```

Only blocks with `included !== false` and non-empty content participate. Inputs are never mutated. Character limits use Unicode code points, so an emoji is one sizing unit and is never split between UTF-16 surrogate halves. Source offsets remain UTF-16 offsets because they map directly to JavaScript `String.slice` and browser DOM text offsets.

### Recursive splitting

`recursive.ts` creates one canonical stream by joining reviewed block content with `\n\n`. It takes windows no larger than `maxCharacters`, preferring the last boundary in this order:

1. block/paragraph break (`\n\n`);
2. line break;
3. sentence boundary (`. `);
4. word boundary;
5. a hard Unicode-safe boundary.

The next window begins up to `overlapCharacters` before the previous end. The actual overlap is stored on the later chunk with the previous chunk ID/sequence, exact code-point count, and SHA-256 hash. A high requested overlap cannot stall the splitter: it always advances at least one code point.

Recursive chunks may cross headings and structural blocks. When code, table, list, or any other block appears in multiple chunks, every affected chunk receives continuation metadata. This makes structural cuts visible rather than pretending the structure remained intact.

### Heading-aware splitting

`heading-aware.ts` flushes the current chunk before every heading, then keeps that heading with following blocks while the combined content fits. It never splits a block that is within the maximum and never adds overlap. The chunk's `headingPath` is the longest common hierarchy prefix of all contributing blocks.

An oversized block is split separately:

- code prefers complete lines;
- tables prefer complete Markdown rows;
- lists prefer complete item lines;
- prose prefers paragraph, line, sentence, and word boundaries;
- a single oversized line falls back to Unicode-safe hard boundaries.

Every part receives `{ sourceBlockId, blockType, part, totalParts, reason: "oversized" }`. Headers and rows are never silently removed, and table headers are not repeated as undeclared duplication. The original content is recoverable by concatenating its ordered source spans.

### Exact source relationships

Every chunk contains `sourceBlockIds` plus `sourceSpans`:

```ts
{
  blockId: "blk_…",
  startOffset: 120,
  endOffset: 360,
  overlapCharacters: 40
}
```

The half-open offsets identify the exact substring contributed by a block. `overlapCharacters` identifies the portion already present in the previous recursive chunk. These records support three guarantees:

- Day 4 tests can reconstruct every source block and detect missing text;
- Day 6 can highlight all contributing source anchors;
- the UI can show block relationships without parsing chunk text.

### Stable chunk ID construction

`common.ts` computes `contentHash = SHA-256(chunk.content)`, then hashes this canonical, recursively key-sorted payload:

```json
{
  "sourceNamespace": "cap_…",
  "strategy": "recursive",
  "headingPath": ["Guide", "Install"],
  "sourceBlockIds": ["blk_a", "blk_b"],
  "sequence": 3,
  "contentHash": "64-character SHA-256 hex"
}
```

The first 24 hexadecimal characters become `chk_<24 hex>`.

| Component | Why it matters |
|---|---|
| Source namespace | Prevents identical prose from unrelated captures sharing identity |
| Strategy | Recursive and heading-aware outputs remain distinct even if text happens to match |
| Heading path | Encodes the structural context in which the chunk was produced |
| Source block IDs | Distinguishes equal text assembled from different provenance |
| Sequence | Distinguishes repeated identical chunks and preserves ordered identity |
| Content hash | Makes any content/boundary change produce a new ID |

Settings are not added separately: settings affect boundaries, sequence, source relationships, or content hash. Avoiding redundant settings keeps identity tied to actual output rather than irrelevant configuration differences that produce the same chunk.

### Comparison UI

The **Compare Chunks** tab computes both strategies in parallel whenever reviewed blocks or settings change. Default view is two columns; **Both**, **Recursive**, and **Heading-aware** controls let users focus one strategy without recomputing different data.

Each column shows:

- chunk count;
- minimum, median, and maximum character size;
- total declared overlap;
- a compact size-distribution chart;
- heading breadcrumb, character/token estimates, content preview;
- contributing block chips;
- overlap and continuation badges.

Clicking a chunk sends all `sourceBlockIds` to `App.tsx`, opens the Block Tree, highlights every source block, and scrolls the first contribution into view. The highlight banner reports the relationship count and provides a clear action.

The user-facing 20-second explanation is deliberately shown above the comparison:

> Recursive makes even overlapping windows. Heading-aware keeps sections and blocks together.

## 3. Test cases

`chunking.test.ts` covers:

- empty input and entirely excluded content;
- exact-size input;
- invalid maximum and overlap settings;
- recursive maximum enforcement and exact declared-overlap reconstruction;
- Unicode/emoji boundaries without replacement characters;
- headings starting new section chunks;
- normal lists and blocks remaining intact under the heading-aware limit;
- oversized code split by lines with numbered continuation metadata;
- oversized tables split by rows without header duplication or truncation;
- oversized lists split at item lines;
- a single oversized Unicode line using hard safe boundaries;
- recursive code/table structural continuations;
- namespace and strategy participation in IDs;
- ten parallel runs producing byte-identical serialized chunks and IDs.

`chunk-comparison.test.tsx` covers live settings recomputation, both columns, metrics, strategy focus toggles, and clicking a chunk to return contributing block IDs. `sidepanel.test.tsx` confirms that all returned IDs receive the visible source highlight.

The Python contract test verifies that the service accepts source spans, overlap, and continuation metadata unchanged.

## 4. Key learnings and design decisions

### Recursive strengths and trade-offs

Recursive splitting gives predictable, densely filled chunks and context continuity around arbitrary boundaries. It is useful for prose-heavy pages where retrieval benefits from local overlap and strict embedding-size utilization. Its weakness is structural blindness: it may divide code, tables, or a section heading from its explanation. Explicit source spans and continuation badges make that compromise inspectable.

### Heading-aware strengths and trade-offs

Heading-aware splitting produces chunks that are easier to explain, cite, and review because section scope and block identity survive. It is usually the better default for documentation, API references, and tutorials. Chunk sizes are less uniform, and a page with poor heading markup receives less benefit. Oversized structures still require controlled continuations.

### Why character limits

Day 4 uses deterministic Unicode code-point limits instead of a model-specific tokenizer. This makes browser behavior reproducible without downloading a tokenizer and avoids coupling capture/chunk review to Day 5's embedding model. `tokenCount` is an explicitly approximate deterministic lexical count for display. Day 5 may add model-token diagnostics without changing Day 4 chunk identity unless it changes boundaries.

### Why spans instead of inferred provenance

Parsing a finished chunk to guess which block supplied a phrase fails for duplicated text and overlap. Exact source offsets are small, deterministic, independently testable, and sufficient for later highlights and coverage audits.

### Why deterministic IDs matter

Stable IDs enable embedding caches, repeatable retrieval tests, reproducible exports, and meaningful diffs. Random UUIDs would make an unchanged re-run look entirely new, invalidating Day 5 caches and Day 6 evaluation history.

## 5. How to validate the acceptance gate

Run the focused Day 4 suite:

```bash
npm run test:chunking
```

Run all service, extension, type, and production-build gates:

```bash
npm test
```

Manual UI gate:

1. Capture the Day 2 golden fixture and review included blocks.
2. Open **Compare Chunks**. Confirm both columns render together.
3. Set maximum to `120` and recursive overlap to `20`; observe immediate recomputation.
4. Confirm recursive chunks are more even and show overlap badges, while heading-aware chunks start at headings and show zero overlap.
5. Reduce maximum until code/table continuation badges appear. Confirm part numbers are ordered and no content disappears.
6. Toggle **Both**, **Recursive**, and **Heading-aware**.
7. Click a multi-block chunk. Confirm the Block Tree opens, every `B#` contributor is highlighted, and the first is scrolled into view.
8. Return to comparison without changing inputs. IDs and content must be unchanged.

Automated acceptance mapping:

| Acceptance requirement | Proof |
|---|---|
| Same input/settings byte-identical ten times | Ten-run `JSON.stringify` equality test |
| No silent loss | Recursive canonical reconstruction and heading source-span reconstruction |
| Duplication only when declared | Recursive overlap suffix/prefix/hash assertions; heading overlap always absent |
| Oversized code/table never truncate | Continuation part tests plus exact source reconstruction |
| All boundary cases | Empty, exact, Unicode, list, table, code, single-line, invalid settings tests |
| Both strategies visible and toggleable | Component rendering/focus tests |
| Chunk click highlights all blocks | Callback relationship test plus BlockTree highlight test |
| Difference explainable quickly | Persistent one-sentence explainer and visible overlap/section metrics |

