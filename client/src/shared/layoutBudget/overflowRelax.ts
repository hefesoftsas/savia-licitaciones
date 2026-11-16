import { normalizeSaviaMarkup } from '../bodyHtml/saviaMarkup.mjs';
/**
 * Post-assembly fallback: repack actual model output and adjust layout if gaps remain. Pre-generation
 * skeleton packing assumes upper bounds, but the model may add two text lines, choose a taller frame, or put
 * four images in a group. Remeasure actual content and use shorter frames, remove one grouped image, or
 * split image/text layouts. Change only structure and attributes before rendering, preserving all text
 * rather than repairing generated content.
 */
import type { FigureSize, PageMetrics, TablePreset } from './pageMetrics';
import {
  FIGURE_GEOMETRY,
  FIGURE_SIZES,
  figureGroupHeightCm,
  imageTextCharsPerLine,
} from './pageMetrics';
import type { LayoutSimulation, SkeletonBlock } from './sectionSkeleton';
import { describeGapPosition, imageTextQuota, simulateLayout } from './sectionSkeleton';

/** Caption font size, consistent with skeleton planning. */
const CAPTION_SIZE_PT = 9;

/** Maximum adjustment rounds; each changes one block. If no adjustment works, stop and let the caller inspect diagnostics. */
const MAX_ROUNDS = 4;

export interface RelaxResult {
  html: string;
  /** Actions taken at each step, explaining algorithm behavior on the test page. */
  actions: string[];
  /** Actual packing results before and after adjustment. */
  before: LayoutSimulation;
  after: LayoutSimulation;
}

const isFigureSize = (value: string): value is FigureSize => value in FIGURE_GEOMETRY;

const TABLE_PRESETS: TablePreset[] = [
  'plain', 'headerRow', 'headerColumn', 'headerRowAndColumn', 'imageText', 'threeImages', 'fourImages',
];
const isTablePreset = (value: string): value is TablePreset =>
  (TABLE_PRESETS as string[]).includes(value);

function parseBody(html: string) {
  return new DOMParser().parseFromString(`<body>${normalizeSaviaMarkup(html)}</body>`, 'text/html').body;
}

function serializeBody(body: HTMLElement) {
  return Array.from(body.children)
    .map((element) => `<!-- savia:block -->\n${element.outerHTML}`)
    .join('\n\n');
}

/** Valid top-level block ID pattern, matching restrictedHtml validation. */
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/**
 * Paragraphs inside cells may omit IDs, but promoted top-level blocks require them. Otherwise
 * parseRestrictedHtml() reports a missing valid paragraph ID, turning compliant model output into invalid
 * markup.
 */
function assignPromotedIds(elements: Element[], source: Element, prefix: string) {
  const root = source.ownerDocument.body;
  const used = new Set(
    Array.from(root.querySelectorAll('[id]')).map((element) => element.getAttribute('id') || ''),
  );
  const base = ID_PATTERN.test(prefix) ? prefix : `blk${prefix.replace(/[^A-Za-z0-9_-]/g, '')}`;
  let seq = 1;
  for (const element of elements) {
    if (ID_PATTERN.test(element.getAttribute('id') || '')) continue;
    let id = `${base}-p${seq}`;
    while (used.has(id)) {
      seq += 1;
      id = `${base}-p${seq}`;
    }
    element.setAttribute('id', id);
    used.add(id);
    seq += 1;
  }
}

/** Body-word count within an element, excluding captions and image prompts. */
function textChars(element: Element) {
  const clone = element.cloneNode(true) as Element;
  for (const node of Array.from(clone.querySelectorAll('template, figcaption, caption'))) node.remove();
  return (clone.textContent || '').replace(/\s+/g, '').length;
}

function figureSizeOf(figure: Element | null, fallback: FigureSize = 'wide'): FigureSize {
  const value = (figure?.getAttribute('data-sv-size') || '').trim();
  return isFigureSize(value) ? value : fallback;
}

/**
 * Convert assembled HTML into packable blocks using actual word counts, selected frames, and image counts
 * per group.
 */
export function measureAssembledBlocks(html: string, metrics: PageMetrics): SkeletonBlock[] {
  const body = parseBody(html);
  return Array.from(body.children).map((element, index): SkeletonBlock => {
    const tag = element.tagName.toLowerCase();
    const id = element.getAttribute('id') || `blk${index}`;

    if (/^h[1-6]$/.test(tag)) {
      return { kind: 'heading', id, level: Number(tag.slice(1)), text: element.textContent || '' };
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = element.querySelectorAll('li').length || 1;
      return {
        kind: 'list',
        id,
        ordered: tag === 'ol',
        items,
        charsPerItem: Math.ceil(textChars(element) / items),
      };
    }

    if (tag === 'figure') {
      const size = figureSizeOf(element);
      return {
        kind: 'figure',
        id,
        // Use frame heights computed in metrics, which already account for the template's maximum image width.
        // Recomputing from widthRatio bypasses that limit and disagrees with planning and Word rendering.
        budgetHeightCm: metrics.figureImageHeightCm[size] + captionChromeCm(metrics),
        allowedSizes: [size],
        suggestedGeneration: 'mermaid',
      };
    }

    if (tag === 'table') {
      const preset = element.getAttribute('data-sv-preset') || 'plain';
      const figures = element.querySelectorAll('figure');

      if (preset === 'imageText') {
        const size = figureSizeOf(figures[0] ?? null);
        const bodyCell = element.querySelectorAll('td')[1] ?? null;
        const chars = bodyCell ? textChars(bodyCell) : 0;
        return {
          kind: 'imageText',
          id,
          figureId: figures[0]?.getAttribute('id') || `${id}-fig`,
          size,
          budgetHeightCm: 0,
          suggestedGeneration: 'mermaid',
          targetChars: chars,
          minChars: chars,
          maxChars: chars,
          maxLines: Math.ceil(chars / imageTextCharsPerLine(metrics)),
        };
      }

      if (preset === 'threeImages' || preset === 'fourImages') {
        const count = preset === 'threeImages' ? 3 : 4;
        const size = figureSizeOf(figures[0] ?? null, 'square');
        return {
          kind: 'figureGroup',
          id,
          count,
          figureIds: Array.from(figures).map((figure) => figure.getAttribute('id') || ''),
          budgetHeightCm: figureGroupHeightCm(metrics, count, size, CAPTION_SIZE_PT),
          allowedSizes: [size],
          suggestedGeneration: 'mermaid',
        };
      }

      const rows = element.querySelectorAll('tbody > tr').length;
      const hasHeader = element.querySelector('thead') !== null;
      const cols = element.querySelector('tr')?.querySelectorAll('th, td').length || 1;
      return {
        kind: 'table',
        id,
        preset: isTablePreset(preset) ? preset : 'plain',
        rows,
        cols,
        hasHeader,
      };
    }

    const chars = textChars(element);
    return { kind: 'paragraph', id, role: 'body', targetChars: chars, minChars: chars, maxChars: chars };
  });
}

/** Caption height plus spacing before and after the image. */
function captionChromeCm(metrics: PageMetrics) {
  return metrics.lineHeightCm + metrics.paragraphSpaceBeforeCm + metrics.paragraphSpaceAfterCm;
}

/** Height reduction available from a shorter standalone-image frame; null when already shortest. */
function shorterSize(metrics: PageMetrics, current: FigureSize): FigureSize | null {
  // Use metrics here too: maximum-width limits can change frame-height ordering relative to raw ratios.
  const heightOf = (size: FigureSize) => metrics.figureImageHeightCm[size];
  const shorter = FIGURE_SIZES
    .filter((size) => heightOf(size) < heightOf(current))
    .sort((left, right) => heightOf(right) - heightOf(left));
  return shorter[0] ?? null;
}

/** Switch an image group to a shorter frame. */
function shorterGroupSize(metrics: PageMetrics, count: 3 | 4, current: FigureSize): FigureSize | null {
  const heightOf = (size: FigureSize) => figureGroupHeightCm(metrics, count, size, CAPTION_SIZE_PT);
  const shorter = FIGURE_SIZES
    .filter((size) => heightOf(size) < heightOf(current))
    .sort((left, right) => heightOf(right) - heightOf(left));
  return shorter[0] ?? null;
}

/**
 * Move overflowing right-column paragraphs after the table. This is the preferred imageText overflow remedy:
 * preserve the layout and predictable image-based row height while moved paragraphs can flow across pages.
 * Move whole p elements without splitting sentences or changing words.
 */
function trimImageTextOverflow(table: Element, metrics: PageMetrics): boolean {
  const cells = table.querySelectorAll('td');
  const bodyCell = cells[1];
  if (!bodyCell) return false;
  const quota = imageTextQuota(metrics, figureSizeOf(cells[0]?.querySelector('figure'))).maxChars;

  const paragraphs = Array.from(bodyCell.children);
  let used = 0;
  let keep = 0;
  for (const paragraph of paragraphs) {
    const chars = textChars(paragraph);
    // Keep at least one paragraph in the right column or the layout loses its purpose.
    if (keep > 0 && used + chars > quota) break;
    used += chars;
    keep += 1;
  }
  if (keep >= paragraphs.length) return false;

  const moved = paragraphs.slice(keep);
  assignPromotedIds(moved, table, table.getAttribute('id') || 'blk');

  let anchor: Node = table;
  for (const paragraph of moved) {
    table.parentElement?.insertBefore(paragraph, anchor.nextSibling);
    anchor = paragraph;
  }
  return true;
}

/**
 * Split mixed image/text into a standalone image and normal paragraphs. This is most effective because
 * paragraphs can flow across pages instead of pushing the whole block down. Use it last because it loses the
 * image-left/text-right layout.
 */
function splitImageText(table: Element, metrics: PageMetrics): Element[] {
  const document = table.ownerDocument;
  const cells = table.querySelectorAll('td');
  const figure = cells[0]?.querySelector('figure');
  const caption = table.querySelector('caption')?.textContent?.trim() || '';

  const results: Element[] = [];
  if (figure) {
    // Cell images use 0.44 of content width, while standalone images use at least 0.5, so the image necessarily grows.
    // Also select the shortest frame to minimize that side effect.
    const shortest = [...FIGURE_SIZES].sort(
      (left, right) => metrics.figureImageHeightCm[left] - metrics.figureImageHeightCm[right],
    )[0];
    figure.setAttribute('data-sv-size', shortest);
    // A table image needs no caption, but a standalone image does, so readers can identify it.
    if (caption && !figure.querySelector('figcaption')) {
      const figcaption = document.createElement('figcaption');
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }
    results.push(figure);
  }
  for (const node of Array.from(cells[1]?.children || [])) {
    if (node.tagName.toLowerCase() === 'figure') continue;
    results.push(node);
  }
  // Add IDs before promoting right-column paragraphs from cells to top-level blocks.
  assignPromotedIds(
    results.filter((element) => element.tagName.toLowerCase() !== 'figure'),
    table,
    table.getAttribute('id') || 'blk',
  );
  return results;
}

/** Remove the last grouped image, reducing a four-image grid to three columns. */
function shrinkGroup(table: Element) {
  const figures = table.querySelectorAll('figure');
  if (figures.length <= 3) return false;
  const rows = Array.from(table.querySelectorAll('tbody > tr'));
  // A four-image grid has two rows and columns; removing the second row leaves too few images, so use three in one row.
  const kept = Array.from(figures).slice(0, 3);
  const tbody = table.querySelector('tbody');
  if (!tbody) return false;
  for (const row of rows) row.remove();
  const document = table.ownerDocument;
  const row = document.createElement('tr');
  for (const figure of kept) {
    const cell = document.createElement('td');
    cell.appendChild(figure);
    row.appendChild(cell);
  }
  tbody.appendChild(row);
  table.setAttribute('data-sv-preset', 'threeImages');
  return true;
}

/** Total gap height is the sole criterion for whether a layout downgrade improves the result. */
function gapScore(simulation: LayoutSimulation) {
  return simulation.gaps.reduce((total, gap) => total + gap.heightCm, 0);
}

/** Candidate downgrade: modify body in place and report whether it changed. */
type Candidate = { label: string; apply: (element: Element) => boolean };

/** Available downgrade actions for a block, ordered from least to most costly. */
function candidatesFor(element: Element, metrics: PageMetrics): Candidate[] {
  const tag = element.tagName.toLowerCase();
  const preset = element.getAttribute('data-sv-preset') || '';
  const id = element.getAttribute('id') || '';

  if (tag === 'figure') {
    const current = figureSizeOf(element);
    const next = shorterSize(metrics, current);
    return next
      ? [{
        label: `${id} 画框 ${current} → ${next}`,
        apply: (target) => { target.setAttribute('data-sv-size', next); return true; },
      }]
      : [];
  }

  if (preset === 'threeImages' || preset === 'fourImages') {
    const count = preset === 'threeImages' ? 3 : 4;
    const current = figureSizeOf(element.querySelector('figure'), 'square');
    const next = shorterGroupSize(metrics, count, current);
    const list: Candidate[] = [];
    if (next) {
      list.push({
        label: `图组 ${id} 画框 ${current} → ${next}`,
        apply: (target) => {
          for (const figure of Array.from(target.querySelectorAll('figure'))) {
            figure.setAttribute('data-sv-size', next);
          }
          return true;
        },
      });
    }
    if (preset === 'fourImages') {
      list.push({ label: `四宫格 ${id} 降为一行三列`, apply: (target) => shrinkGroup(target) });
    }
    return list;
  }

  if (preset === 'imageText') {
    return [
      {
        label: `图文混排 ${id} 右栏溢出的段落移到表格后面`,
        apply: (target) => trimImageTextOverflow(target, metrics),
      },
      {
        label: `图文混排 ${id} 拆成独立图加段落`,
        apply: (target) => {
          const replacements = splitImageText(target, metrics);
          if (replacements.length === 0) return false;
          for (const node of replacements) target.parentElement?.insertBefore(node, target);
          target.remove();
          return true;
        },
      },
    ];
  }

  // Data tables have no layout downgrade available.
  return [];
}

/**
 * Repack actual content and try layout downgrades if gaps remain. Trial each action, measure, and roll back
 * if unhelpful: shrinking an image that still does not fit or splitting a layout that adds a page provides
 * no benefit. Keep changes only when total gap height decreases. Stop after exhausting options, preserve the
 * original, and report remaining gaps honestly; some are inherent to the content and forced changes only
 * sacrifice layout.
 */
export function relaxOverflow(html: string, metrics: PageMetrics, startOffsetCm = 0): RelaxResult {
  const actions: string[] = [];
  const measure = (source: string) => simulateLayout(metrics, measureAssembledBlocks(source, metrics), startOffsetCm);
  const before = measure(html);

  let current = html;
  let simulation = before;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    if (simulation.gaps.length === 0) break;
    const baseline = gapScore(simulation);

    const gap = simulation.gaps[0];
    // The displaced block is first in the next column; in two-column templates this need not be the next page.
    const offenderIndex = simulation.placed.findIndex((item) => item.column === gap.column + 1);
    if (offenderIndex < 0) break;

    const probe = parseBody(current);
    const offender = probe.children[offenderIndex];
    if (!offender) break;

    let improved = false;
    for (const candidate of candidatesFor(offender, metrics)) {
      // Try each candidate on an independent copy so failures leave the original intact.
      const trialBody = parseBody(current);
      const target = trialBody.children[offenderIndex];
      if (!target || !candidate.apply(target)) continue;

      const trialHtml = serializeBody(trialBody);
      const trialSimulation = measure(trialHtml);
      // Require a margin of improvement to avoid sacrificing layout for a few millimeters.
      if (gapScore(trialSimulation) >= baseline - metrics.lineHeightCm) continue;

      actions.push(
        `${describeGapPosition(gap, simulation.columnsPerPage)}尾剩 ${gap.lines} 行：${candidate.label}，`
        + `空洞从 ${(baseline / metrics.lineHeightCm).toFixed(0)} 行降到 `
        + `${(gapScore(trialSimulation) / metrics.lineHeightCm).toFixed(0)} 行。`,
      );
      current = trialHtml;
      simulation = trialSimulation;
      improved = true;
      break;
    }

    if (!improved) {
      const id = offender.getAttribute('id') || offender.tagName.toLowerCase();
      actions.push(
        `${describeGapPosition(gap, simulation.columnsPerPage)}尾剩 ${gap.lines} 行：`
        + `${id} 没有能真正改善的降级手段，保留原样。`,
      );
      break;
    }
  }

  return { html: current, actions, before, after: simulation };
}
