/**
 * Section skeleton planner: before generation, use layout metrics to create a deterministic block sequence
 * with paragraph word ranges and image positions/sizes, but no content. AI supplies prompts and captions
 * while writing, eliminating separate image planning. Forward packing accumulates block heights; when an
 * image would move to the next page, adjust the preceding paragraph quota to fill the current page. This
 * changes ungenerated quotas rather than repairing existing text.
 */
import type { FigureGeneration, FigureSize, PageMetrics, TablePreset } from './pageMetrics';
import {
  CELL_PLACEMENT,
  FIGURE_GEOMETRY,
  FIGURE_SIZES,
  MAX_FIGURE_PAGE_RATIO,
  cellImageWidthCm,
  charsForHeightCm,
  figureHeightAtWidthCm,
  figureGroupHeightCm,
  imageTextCharsPerLine,
  imageTextHeightCm,
  listHeightCm,
  paragraphHeightCm,
  tableHeightCm,
} from './pageMetrics';

/** Minimum paragraph word count; shorter text no longer reads like a paragraph. */
export const MIN_PARAGRAPH_CHARS = 90;
/** Maximum paragraph word count; model length control becomes inaccurate beyond it. */
export const MAX_PARAGRAPH_CHARS = 420;
/** Default paragraph target word count. */
export const DEFAULT_PARAGRAPH_CHARS = 230;
/** Relative half-width of AI word ranges: too narrow is unattainable; too broad undermines packing. */
export const PARAGRAPH_TOLERANCE_RATIO = 0.12;
/** Treat remaining page height below this line-based threshold as full and not worth adjusting. */
export const ACCEPTABLE_TAIL_LINES = 2;

export type SkeletonBlock =
  | { kind: 'heading'; id: string; level: number; text: string }
  | {
    kind: 'paragraph';
    id: string;
    role: 'lead' | 'body' | 'bridge' | 'close';
    targetChars: number;
    minChars: number;
    maxChars: number;
  }
  | {
    kind: 'list';
    id: string;
    ordered: boolean;
    items: number;
    charsPerItem: number;
  }
  | {
    kind: 'figure';
    id: string;
    /**
     * Image height upper bound assigned by layout and used for packing. Actual images can only be shorter, so
     * packing remains valid whichever permitted frame the model selects.
     */
    budgetHeightCm: number;
    /** Frames within the height bound; the model chooses the one best suited to the content. */
    allowedSizes: FigureSize[];
    /** Suggested generation method, rotated so all three appear within a section; the model may change it to suit content. */
    suggestedGeneration: FigureGeneration;
  }
  | {
    kind: 'imageText';
    id: string;
    figureId: string;
    /**
     * Layout fixes the frame rather than the model. The left cell is 0.44 of content width; the frame ratio
     * determines right-column text height rather than content. Letting the model choose would make row height
     * the maximum of two independent variables and defeat packing predictions.
     */
    size: FigureSize;
    budgetHeightCm: number;
    suggestedGeneration: FigureGeneration;
    /** Right-text word quota derived from image height so filling it cannot increase row height. */
    targetChars: number;
    minChars: number;
    maxChars: number;
    /** Maximum right-column lines, explaining the quota to the model. */
    maxLines: number;
  }
  | {
    kind: 'figureGroup';
    id: string;
    /** Three parallel columns or a four-image grid. */
    count: 3 | 4;
    figureIds: string[];
    budgetHeightCm: number;
    allowedSizes: FigureSize[];
    suggestedGeneration: FigureGeneration;
  }
  | {
    kind: 'table';
    id: string;
    preset: TablePreset;
    /** Number of data rows, excluding headers. */
    rows: number;
    cols: number;
    hasHeader: boolean;
  };

export interface PlacedBlock {
  block: SkeletonBlock;
  heightCm: number;
  /** Zero-based physical page index; equals column in single-column layouts. */
  page: number;
  /** Zero-based column index. Two-column templates have two per physical page; packing operates by column. */
  column: number;
  /** Distance from this block's top to the column content area's top. */
  topCm: number;
}

export interface LayoutSimulation {
  placed: PlacedBlock[];
  /** Physical page count, directly comparable to the layout engine's getPageGeometry(). */
  pageCount: number;
  /** Columns per physical page from template settings. */
  columnsPerPage: number;
  /** Remaining height in cm at each column end; column bottoms are the actual breakpoints. */
  tailCm: number[];
  /** Remaining column-end height expressed as body lines. */
  tailLines: number[];
  /** Gaps exceeding the threshold, which this strategy aims to eliminate. */
  gaps: { page: number; column: number; heightCm: number; lines: number; ratio: number }[];
}

/** Chinese gap-location description: name only the page for single columns, but specify the column in two-column layouts to match Word. */
export function describeGapPosition(
  gap: { page: number; column: number },
  columnsPerPage: number,
) {
  if (columnsPerPage <= 1) return `第 ${gap.page + 1} 页`;
  const inPage = gap.column - gap.page * columnsPerPage;
  const label = columnsPerPage === 2 ? ['左栏', '右栏'][inPage] : `第 ${inPage + 1} 栏`;
  return `第 ${gap.page + 1} 页${label ?? `第 ${inPage + 1} 栏`}`;
}

export interface SkeletonPlanInput {
  metrics: PageMetrics;
  /** Section heading level, starting at one. */
  headingLevel: number;
  headingText: string;
  /** Target body words for this section, excluding headings and captions. */
  targetChars: number;
  /** Images to include in the section; the model determines subjects, frames, and generation methods from content. */
  figureCount: number;
  /** Maximum page-height fraction per image; defaults to MAX_FIGURE_PAGE_RATIO. */
  maxFigurePageRatio?: number;
  /** Explicit layout per image block; otherwise rotate FIGURE_LAYOUTS. */
  figureLayouts?: FigureLayout[];
  /** Whether to include data tables; defaults to deciding by word count. */
  withTable?: boolean;
  /** Whether to include a list in the body. */
  withList: boolean;
  /** Height already used on the current page when the section starts; tests default to an empty page. */
  startOffsetCm?: number;
}

export interface SkeletonPlan {
  blocks: SkeletonBlock[];
  simulation: LayoutSimulation;
  /** Quota adjustments made to remove gaps, explaining algorithm behavior on the test page. */
  adjustments: string[];
  /** Adjusted total body words, which may differ from the target. */
  plannedChars: number;
  /** Advice when packing still cannot produce a satisfactory layout; empty means the section fits. */
  advice: string[];
  /** Remaining gaps mean the layout is infeasible; callers should reduce images or add text rather than force it. */
  feasible: boolean;
}

/**
 * To place an image without gaps, text must fill the rest of its page. Its entry cost is therefore the word
 * capacity of one page minus the image block height.
 */
export function figureAdmissionChars(metrics: PageMetrics, figureHeightCm: number) {
  return charsForHeightCm(metrics, metrics.contentHeightCm - figureHeightCm);
}

/** Maximum images that fit a given word count. */
export function maxFiguresForChars(metrics: PageMetrics, chars: number, maxPageRatio = MAX_FIGURE_PAGE_RATIO) {
  const admission = figureAdmissionChars(metrics, resolveFigureBudget(metrics, maxPageRatio).heightCm);
  if (admission <= 0) return 0;
  return Math.max(0, Math.floor(chars / admission));
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Caption size is configurable in templates; use common small-five size here, affecting estimates by only a few millimeters. */
const CAPTION_SIZE_PT = 9;

/** Rotate image layouts so a section does not contain only standalone images. */
const FIGURE_LAYOUTS = ['single', 'imageText', 'group3', 'group4', 'single', 'imageText'] as const;
export type FigureLayout = (typeof FIGURE_LAYOUTS)[number];
export { FIGURE_LAYOUTS };

/** Rotate generation methods so mermaid, htmlImage, and aiImage all appear. */
const GENERATION_ROTATION: FigureGeneration[] = ['mermaid', 'htmlImage', 'aiImage'];

/** Rotate data-table presets to vary header structures. */
const TABLE_PRESETS: TablePreset[] = ['headerRow', 'headerRowAndColumn', 'headerColumn'];

/**
 * Block height uses upper bounds wherever the model has freedom: paragraph word-range maximums and budgeted
 * image heights. Underfilling moves later content up and flowing text fills gaps; overfilling pushes an
 * indivisible block to the next page and leaves a large gap. These costs are asymmetric, so estimate
 * conservatively.
 */
function blockHeightCm(metrics: PageMetrics, block: SkeletonBlock) {
  switch (block.kind) {
    case 'heading':
      return metrics.headingHeightCm[clamp(block.level, 1, 6) - 1] ?? metrics.lineHeightCm * 2;
    case 'paragraph':
      return paragraphHeightCm(metrics, block.maxChars);
    case 'list':
      return listHeightCm(metrics, block.items, block.charsPerItem);
    case 'figure':
    case 'figureGroup':
      return block.budgetHeightCm;
    case 'imageText':
      // Layout fixes the frame and derives right-text quota from image height, so this block's height equals image height.
      return imageTextHeightCm(metrics, block.size, block.maxChars, CAPTION_SIZE_PT);
    case 'table':
      return tableHeightCm(metrics, block.rows, block.hasHeader, CAPTION_SIZE_PT);
    default:
      return 0;
  }
}

/**
 * Forward packing: images and tables are indivisible and move whole to the next page when they do not fit.
 * Paragraphs can span pages and simply advance the cursor.
 */
export function simulateLayout(
  metrics: PageMetrics,
  blocks: SkeletonBlock[],
  startOffsetCm = 0,
): LayoutSimulation {
  // Packing units are columns, not pages; in two-column templates, metrics already describe single-column dimensions.
  // Filling a column advances to the next; two columns make a physical page, so convert column counts back to pages.
  // Otherwise predicted two-column page counts would double actual counts and disagree with the layout engine.
  const columnHeight = metrics.contentHeightCm;
  const columnsPerPage = Math.max(1, metrics.columnCount);
  const pageOf = (column: number) => Math.floor(column / columnsPerPage);

  const placed: PlacedBlock[] = [];
  const tailCm: number[] = [];
  let column = 0;
  let cursor = clamp(startOffsetCm, 0, columnHeight);

  for (const block of blocks) {
    const height = blockHeightCm(metrics, block);
    // Images, groups, mixed image/text, and tables are indivisible: C# sets CantSplit on table rows.
    const atomic = block.kind !== 'paragraph' && block.kind !== 'list';
    const remain = columnHeight - cursor;

    if (atomic && height > remain && height <= columnHeight) {
      // The whole block does not fit: end this column here and count its remaining height as a gap.
      tailCm[column] = remain;
      column += 1;
      cursor = 0;
    }

    placed.push({ block, heightCm: height, page: pageOf(column), column, topCm: cursor });
    cursor += height;

    while (cursor > columnHeight) {
      // Paragraphs flow into the next column; overflow leaves no gap at the column end.
      tailCm[column] = 0;
      cursor -= columnHeight;
      column += 1;
    }
  }

  tailCm[column] = columnHeight - cursor;
  const tailLines = tailCm.map((value) => Math.max(0, Math.round(value / metrics.lineHeightCm)));
  const gaps = tailCm
    .map((heightCm, index) => ({
      page: pageOf(index),
      column: index,
      heightCm,
      lines: tailLines[index],
      ratio: heightCm / columnHeight,
    }))
    // Space remaining in the last column is normal end-of-content space, not a gap.
    .filter((gap) => gap.column < tailCm.length - 1 && gap.lines > ACCEPTABLE_TAIL_LINES);

  return {
    placed,
    pageCount: Math.ceil(tailCm.length / columnsPerPage),
    columnsPerPage,
    tailCm,
    tailLines,
    gaps,
  };
}

/** Start with equal-length paragraphs based on target words, then insert images in order between them with text on both sides. */
function buildInitialBlocks(input: SkeletonPlanInput): SkeletonBlock[] {
  const { metrics, targetChars, withList } = input;
  const figureBlockCount = Math.max(0, Math.floor(input.figureCount));
  const budget = resolveFigureBudget(metrics, input.maxFigurePageRatio);

  // Choose layouts first to determine words reserved for image/text right columns.
  const layouts = Array.from(
    { length: figureBlockCount },
    (_, index) => (input.figureLayouts?.[index] ?? FIGURE_LAYOUTS[index % FIGURE_LAYOUTS.length]) as FigureLayout,
  );
  // Right-column text counts as body content; subtract its actual quota from the total first.
  const imageTextCount = layouts.filter((layout) => layout === 'imageText').length;
  const imageTextChars = imageTextCount > 0
    ? imageTextQuota(metrics, pickImageTextSize(metrics, budget.sizes)).targetChars
    : 0;

  const listItems = withList ? 3 : 0;
  const listCharsPerItem = 28;
  const listChars = listItems * listCharsPerItem;
  const tableCount = input.withTable === false
    ? 0
    // Reserve one data table per 1,500 words; omit tables for short sections.
    : Math.min(2, Math.floor(targetChars / 1500));
  const tableRows = 3;
  // Table text counts as body content, estimated at 12 words per cell.
  const tableChars = tableCount * (tableRows + 1) * 3 * 12;

  const proseChars = Math.max(
    MIN_PARAGRAPH_CHARS,
    targetChars - listChars - imageTextCount * imageTextChars - tableChars,
  );

  const paragraphCount = Math.max(
    // Each image block needs text on both sides, so paragraph count must be at least image-block count plus one.
    figureBlockCount + 1,
    Math.round(proseChars / DEFAULT_PARAGRAPH_CHARS) || 1,
  );
  const perParagraph = clamp(
    Math.round(proseChars / paragraphCount),
    MIN_PARAGRAPH_CHARS,
    MAX_PARAGRAPH_CHARS,
  );

  const blocks: SkeletonBlock[] = [
    { kind: 'heading', id: 'h', level: input.headingLevel, text: input.headingText },
  ];

  const paragraphs: SkeletonBlock[] = Array.from({ length: paragraphCount }, (_, index) => ({
    kind: 'paragraph' as const,
    id: `p${index + 1}`,
    role: index === 0
      ? 'lead' as const
      : index === paragraphCount - 1 ? 'close' as const : 'body' as const,
    targetChars: perParagraph,
    minChars: Math.round(perParagraph * (1 - PARAGRAPH_TOLERANCE_RATIO)),
    maxChars: Math.round(perParagraph * (1 + PARAGRAPH_TOLERANCE_RATIO)),
  }));

  // Space image blocks evenly between paragraphs, after the first and before the last.
  const figureSlots = Array.from({ length: figureBlockCount }, (_, index) => {
    const step = paragraphCount / (figureBlockCount + 1);
    return clamp(Math.round(step * (index + 1)), 1, paragraphCount - 1);
  });
  // Offset tables from image blocks to avoid large adjacent indivisible regions.
  const tableSlots = Array.from({ length: tableCount }, (_, index) => {
    const step = paragraphCount / (tableCount + 1);
    const slot = clamp(Math.round(step * (index + 1)) + 1, 1, paragraphCount - 1);
    return figureSlots.includes(slot) ? clamp(slot + 1, 1, paragraphCount - 1) : slot;
  });

  let figureSerial = 0;
  const nextFigureId = () => `fig${(figureSerial += 1)}`;

  let listInserted = !withList;
  paragraphs.forEach((paragraph, index) => {
    blocks.push(paragraph);
    const slot = index + 1;

    const figureIndex = figureSlots.indexOf(slot);
    if (figureIndex >= 0) {
      // Rotate generation methods so all three appear within a section.
      const suggestedGeneration = GENERATION_ROTATION[figureIndex % GENERATION_ROTATION.length];
      const layout = layouts[figureIndex];
      const common = {
        budgetHeightCm: budget.heightCm,
        allowedSizes: budget.sizes,
        suggestedGeneration,
      };
      if (layout === 'imageText') {
        // Fix the frame first, then derive right-column words from image height to lock the block height.
        const size = pickImageTextSize(metrics, budget.sizes);
        blocks.push({
          kind: 'imageText',
          id: `mix${figureIndex + 1}`,
          figureId: nextFigureId(),
          size,
          budgetHeightCm: budget.heightCm,
          suggestedGeneration,
          ...imageTextQuota(metrics, size),
        });
      } else if (layout === 'group3' || layout === 'group4') {
        const count = layout === 'group3' ? 3 : 4;
        const groupSize = pickGroupSize(metrics, budget.sizes, count);
        blocks.push({
          kind: 'figureGroup',
          id: `grp${figureIndex + 1}`,
          count,
          figureIds: Array.from({ length: count }, () => nextFigureId()),
          ...common,
          allowedSizes: [groupSize],
          budgetHeightCm: figureGroupHeightCm(metrics, count, groupSize, CAPTION_SIZE_PT),
        });
      } else {
        blocks.push({ kind: 'figure', id: nextFigureId(), ...common });
      }
    }

    const tableIndex = tableSlots.indexOf(slot);
    if (tableIndex >= 0) {
      blocks.push({
        kind: 'table',
        id: `tbl${tableIndex + 1}`,
        preset: TABLE_PRESETS[tableIndex % TABLE_PRESETS.length],
        rows: tableRows,
        cols: 3,
        hasHeader: TABLE_PRESETS[tableIndex % TABLE_PRESETS.length] !== 'headerColumn',
      });
    }

    if (!listInserted && index === 0) {
      blocks.push({
        kind: 'list',
        id: 'list1',
        ordered: true,
        items: listItems,
        charsPerItem: listCharsPerItem,
      });
      listInserted = true;
    }
  });

  return blocks;
}

/**
 * Image-group cells have only one-third or one-half width; portrait frames make groups excessively tall.
 * Choose the candidate with the shortest whole-group height, favoring squarer frames over consuming most of
 * a page.
 */
function pickGroupSize(metrics: PageMetrics, allowed: FigureSize[], count: 3 | 4): FigureSize {
  return [...allowed].sort(
    (left, right) => figureGroupHeightCm(metrics, count, left, CAPTION_SIZE_PT)
      - figureGroupHeightCm(metrics, count, right, CAPTION_SIZE_PT),
  )[0];
}

/**
 * Compute image height budget and available frames. The budget is a fixed page-height fraction beyond which
 * text struggles to fill the surrounding page. Include sizes whose whole-block height fits; if none do, fall
 * back to the shortest so planning continues and advice reports infeasibility instead of throwing here.
 */
export function resolveFigureBudget(metrics: PageMetrics, maxPageRatio = MAX_FIGURE_PAGE_RATIO) {
  const heightCm = metrics.contentHeightCm * maxPageRatio;
  const sizes = FIGURE_SIZES.filter((size) => metrics.figureBlockHeightCm[size] <= heightCm);
  const shortest = [...FIGURE_SIZES].sort(
    (left, right) => metrics.figureBlockHeightCm[left] - metrics.figureBlockHeightCm[right],
  )[0];
  return { heightCm, sizes: sizes.length > 0 ? sizes : [shortest] };
}

/**
 * Derive the image/text right-column word limit from left-image height. Row height is the greater of image
 * and text height; capping text at image height makes the block predictable and prevents blank pages.
 * Reserve one line for punctuation and wrapping variation.
 */
export function imageTextQuota(metrics: PageMetrics, size: FigureSize) {
  const imageWidthCm = cellImageWidthCm(metrics, CELL_PLACEMENT.imageTextImage);
  const imageHeightCm = figureHeightAtWidthCm(imageWidthCm, size);
  const maxLines = Math.max(2, Math.floor(imageHeightCm / metrics.lineHeightCm) - 1);
  const maxChars = maxLines * imageTextCharsPerLine(metrics);
  // Target 90% of the maximum, allowing some underfilling without violation.
  const targetChars = Math.max(MIN_PARAGRAPH_CHARS, Math.round(maxChars * 0.9));
  return {
    maxLines,
    targetChars,
    minChars: Math.round(targetChars * (1 - PARAGRAPH_TOLERANCE_RATIO)),
    maxChars,
  };
}

/**
 * Choose the shortest image/text frame that permits a meaningful right-column explanation without consuming
 * most of the page.
 */
export function pickImageTextSize(metrics: PageMetrics, allowed: FigureSize[]): FigureSize {
  const scored = allowed.map((size) => ({ size, quota: imageTextQuota(metrics, size) }));
  const usable = scored.filter((item) => item.quota.maxChars >= MIN_PARAGRAPH_CHARS * 1.5);
  const pool = usable.length > 0 ? usable : scored;
  return pool.sort((left, right) => left.quota.maxChars - right.quota.maxChars)[0].size;
}

type ParagraphBlock = Extract<SkeletonBlock, { kind: 'paragraph' }>;

/** Sync ranges after quota changes so they always remain centered on target words. */
function retune(paragraph: ParagraphBlock) {
  paragraph.minChars = Math.round(paragraph.targetChars * (1 - PARAGRAPH_TOLERANCE_RATIO));
  paragraph.maxChars = Math.round(paragraph.targetChars * (1 + PARAGRAPH_TOLERANCE_RATIO));
}

/** Convert height differences into words using complete lines only; discard less than one line. */
function charsForGrowth(metrics: PageMetrics, heightCm: number) {
  return Math.max(0, Math.floor(heightCm / metrics.lineHeightCm) * metrics.charsPerLine);
}

function charsForReduction(metrics: PageMetrics, heightCm: number) {
  return Math.max(0, Math.ceil(heightCm / metrics.lineHeightCm) * metrics.charsPerLine);
}

/** Take words from paragraphs within a range without going below their minima; return the amount actually taken. */
function takeChars(blocks: SkeletonBlock[], range: number[], amount: number) {
  let remaining = amount;
  for (const index of range) {
    if (remaining <= 0) break;
    const block = blocks[index];
    if (!block || block.kind !== 'paragraph') continue;
    const spare = block.targetChars - MIN_PARAGRAPH_CHARS;
    if (spare <= 0) continue;
    const taken = Math.min(spare, remaining);
    block.targetChars -= taken;
    retune(block);
    remaining -= taken;
  }
  return amount - remaining;
}

/** Return words to paragraphs within a range without exceeding their maxima; return the amount actually restored. */
function giveChars(blocks: SkeletonBlock[], range: number[], amount: number) {
  let remaining = amount;
  for (const index of range) {
    if (remaining <= 0) break;
    const block = blocks[index];
    if (!block || block.kind !== 'paragraph') continue;
    const room = MAX_PARAGRAPH_CHARS - block.targetChars;
    if (room <= 0) continue;
    const given = Math.min(room, remaining);
    block.targetChars += given;
    retune(block);
    remaining -= given;
  }
  return amount - remaining;
}

const indexRange = (from: number, to: number) => {
  const result: number[] = [];
  const step = from <= to ? 1 : -1;
  for (let index = from; step > 0 ? index <= to : index >= to; index += step) result.push(index);
  return result;
};

/**
 * Remove gaps by finding displaced images and lengthening preceding text to fill the page, or shortening it
 * to bring the image back. Counterbalance either adjustment elsewhere in the section to conserve words:
 * redistribute quotas instead of inventing content. When remaining space exceeds half the image height,
 * adding words is nearer; otherwise remove words.
 */
function closeGaps(input: SkeletonPlanInput, blocks: SkeletonBlock[]) {
  const { metrics } = input;
  const adjustments: string[] = [];
  const working = blocks.map((block) => ({ ...block }));

  for (let round = 0; round < 8; round += 1) {
    const simulation = simulateLayout(metrics, working, input.startOffsetCm);
    if (simulation.gaps.length === 0) break;

    const gap = simulation.gaps[0];
    // The displaced block is first in the next column, which differs from the next page in two-column layouts.
    const offenderIndex = simulation.placed.findIndex((item) => item.column === gap.column + 1);
    if (offenderIndex <= 0) break;

    const offender = working[offenderIndex];
    const offenderHeight = offender.kind === 'paragraph' || offender.kind === 'list'
      ? 0
      : blockHeightCm(metrics, offender);
    // Adjust preceding paragraphs from nearest to farthest and counterbalance with later text to preserve section word count.
    const before = indexRange(offenderIndex - 1, 0);
    const after = indexRange(offenderIndex + 1, working.length - 1);
    const hostIndex = before.find((index) => working[index].kind === 'paragraph');
    if (hostIndex === undefined) break;

    const preferShrink = offenderHeight > 0 && gap.heightCm > offenderHeight / 2;
    let changed = false;

    if (preferShrink) {
      const need = charsForReduction(metrics, offenderHeight - gap.heightCm);
      const taken = takeChars(working, before, need);
      if (taken > 0) {
        giveChars(working, after, taken);
        adjustments.push(
          `${describeGapPosition(gap, simulation.columnsPerPage)}尾剩 ${gap.lines} 行，图差一点放得下：`
          + `前文减 ${taken} 字把图拉回来，减掉的字匀给后文。`,
        );
        changed = true;
      }
    }

    if (!changed) {
      const need = charsForGrowth(metrics, gap.heightCm);
      if (need <= 0) break;
      const host = working[hostIndex] as ParagraphBlock;
      const direct = Math.min(need, MAX_PARAGRAPH_CHARS - host.targetChars);
      let filled = 0;

      if (direct > 0) {
        host.targetChars += direct;
        retune(host);
        filled += direct;
      }

      const rest = need - filled;
      if (rest >= MIN_PARAGRAPH_CHARS) {
        // If one paragraph cannot absorb the remainder, add a dedicated transition paragraph before the image.
        const filler = clamp(rest, MIN_PARAGRAPH_CHARS, MAX_PARAGRAPH_CHARS);
        const block: ParagraphBlock = {
          kind: 'paragraph',
          id: `p-fill${round + 1}`,
          role: 'bridge',
          targetChars: filler,
          minChars: 0,
          maxChars: 0,
        };
        retune(block);
        working.splice(offenderIndex, 0, block);
        filled += filler;
      }

      if (filled <= 0) break;
      // Recover added words from later text; if insufficient, accept that the section will be slightly longer than target.
      const offenderNow = working.indexOf(offender);
      const returned = takeChars(working, indexRange(offenderNow + 1, working.length - 1), filled);
      adjustments.push(
        `${describeGapPosition(gap, simulation.columnsPerPage)}尾剩 ${gap.lines} 行，前文加 ${filled} 字填满`
        + `${returned > 0 ? `，其中 ${returned} 字从后文匀出` : '（后文无字可匀，本节略长）'}。`,
      );
      changed = true;
    }

    if (!changed) break;
  }

  return { blocks: working, adjustments };
}

export function planSectionSkeleton(input: SkeletonPlanInput): SkeletonPlan {
  const initial = buildInitialBlocks(input);
  const { blocks, adjustments } = closeGaps(input, initial);
  const simulation = simulateLayout(input.metrics, blocks, input.startOffsetCm);
  const plannedChars = blocks.reduce((total, block) => {
    if (block.kind === 'paragraph' || block.kind === 'imageText') return total + block.targetChars;
    if (block.kind === 'list') return total + block.items * block.charsPerItem;
    // Table text counts as body content at roughly 12 words per cell, matching skeleton allocation.
    if (block.kind === 'table') return total + (block.rows + (block.hasHeader ? 1 : 0)) * block.cols * 12;
    return total;
  }, 0);

  const advice: string[] = [];
  if (simulation.gaps.length > 0 && input.figureCount > 0) {
    // An infeasible layout has two remedies: add text or reduce images. Calculate both for the caller to choose.
    const budget = resolveFigureBudget(input.metrics, input.maxFigurePageRatio);
    const admission = figureAdmissionChars(input.metrics, budget.heightCm);
    const affordable = admission > 0 ? Math.floor(input.targetChars / admission) : 0;
    advice.push(
      `本节 ${input.targetChars} 字配 ${input.figureCount} 张图排不开，仍有 ${simulation.gaps.length} 处空洞。`
      + `每张图需要约 ${admission} 字正文才填得满它那一页：`
      + `把正文提到约 ${admission * input.figureCount} 字，或把配图减到 ${affordable} 张。`,
    );
  }
  if (plannedChars > input.targetChars * 1.1) {
    advice.push(`为填满版面，配额比目标多了 ${plannedChars - input.targetChars} 字（${input.targetChars} → ${plannedChars}）。`);
  }

  return { blocks, simulation, adjustments, plannedChars, advice, feasible: simulation.gaps.length === 0 };
}

/**
 * Layout adjudicates model-selected frames: retain those within budget, otherwise downgrade to the closest
 * permitted candidate. The model chooses portrait versus landscape; layout determines maximum height.
 */
export function resolveFigureSize(
  prefer: FigureSize | undefined,
  allowed: FigureSize[],
): { size: FigureSize; downgraded: boolean } {
  if (prefer && allowed.includes(prefer)) return { size: prefer, downgraded: false };
  if (!prefer) return { size: allowed[0], downgraded: false };
  // Choose the closest aspect ratio when downgrading to preserve the model's orientation choice.
  const wanted = FIGURE_GEOMETRY[prefer].aspectWidth / FIGURE_GEOMETRY[prefer].aspectHeight;
  const closest = [...allowed].sort((left, right) => {
    const deltaLeft = Math.abs(FIGURE_GEOMETRY[left].aspectWidth / FIGURE_GEOMETRY[left].aspectHeight - wanted);
    const deltaRight = Math.abs(FIGURE_GEOMETRY[right].aspectWidth / FIGURE_GEOMETRY[right].aspectHeight - wanted);
    return deltaLeft - deltaRight;
  })[0];
  return { size: closest, downgraded: true };
}
