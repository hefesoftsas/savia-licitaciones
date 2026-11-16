/**
 * Split section generation into batches following the skeleton. A single 5,000-word request can exceed
 * provider output limits and truncate HTML. Skeleton blocks already have explicit quotas and images provide
 * natural boundaries, so each batch remains a normal request without an Agent; packing and quotas stay
 * unchanged. Preserve continuity with the full block list (global structure and current position), the
 * preceding batch's ending text (tone), and covered points (avoid repetition).
 */
import type { SkeletonBlock, SkeletonPlan } from './sectionSkeleton';
import { describeSkeleton, type SkeletonPromptContext } from './skeletonPrompt';

/** Target word count per batch: large batches risk output limits; small batches increase batch count and continuity overhead. */
export const DEFAULT_BATCH_CHARS = 2000;
/** After this word count, split at the next image block, a natural paragraph boundary. */
export const BATCH_SPLIT_THRESHOLD_RATIO = 0.6;

export interface GenerationBatch {
  index: number;
  /** Blocks assigned to this batch in skeleton order. */
  blocks: SkeletonBlock[];
  /** Total body-word quota for this batch. */
  chars: number;
}

/** Body-word count of a block, excluding images and headings. */
export function blockChars(block: SkeletonBlock) {
  switch (block.kind) {
    case 'paragraph':
    case 'imageText':
      return block.targetChars;
    case 'list':
      return block.items * block.charsPerItem;
    case 'table':
      // Match skeleton allocation: 12 words per cell.
      return (block.rows + (block.hasHeader ? 1 : 0)) * block.cols * 12;
    default:
      return 0;
  }
}

const isFigureBlock = (block: SkeletonBlock) =>
  block.kind === 'figure' || block.kind === 'figureGroup' || block.kind === 'imageText';

/**
 * Accumulate words, then split after an image block once 60% of the quota is reached. Without an image,
 * split when the quota is exceeded. Headings consume no words and accompany the first batch.
 */
export function planBatches(
  blocks: SkeletonBlock[],
  maxCharsPerBatch = DEFAULT_BATCH_CHARS,
): GenerationBatch[] {
  const writable = blocks.filter((block) => block.kind !== 'heading');
  const total = writable.reduce((sum, block) => sum + blockChars(block), 0);
  if (total <= maxCharsPerBatch) {
    return [{ index: 0, blocks: writable, chars: total }];
  }

  const threshold = maxCharsPerBatch * BATCH_SPLIT_THRESHOLD_RATIO;
  const batches: GenerationBatch[] = [];
  let current: SkeletonBlock[] = [];
  let chars = 0;

  const flush = () => {
    if (current.length === 0) return;
    batches.push({ index: batches.length, blocks: current, chars });
    current = [];
    chars = 0;
  };

  for (const block of writable) {
    const value = blockChars(block);
    // If the next block already exceeds the quota before insertion, finish the preceding batch.
    if (current.length > 0 && chars + value > maxCharsPerBatch) flush();
    current.push(block);
    chars += value;
    // After enough words, an image block is the most natural split point.
    if (chars >= threshold && isFigureBlock(block)) flush();
  }
  flush();

  return batches.map((batch, index) => ({ ...batch, index }));
}

/** Compress generated text into key points so later batches know what has already been covered. */
export function summarizeCovered(html: string, limit = 12) {
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const points: string[] = [];
  for (const element of Array.from(document.body.querySelectorAll('p, li, figcaption, caption'))) {
    const text = (element.textContent || '').replace(/\s+/g, '');
    if (text.length < 8) continue;
    points.push(text.slice(0, 24));
    if (points.length >= limit) break;
  }
  return points;
}

/** Take the preceding batch's ending text to preserve tone and continuity. */
export function tailOf(html: string, chars = 160) {
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const paragraphs = Array.from(document.body.querySelectorAll('p'));
  const last = paragraphs[paragraphs.length - 1];
  const text = (last?.textContent || '').replace(/\s+/g, '');
  return text.length > chars ? text.slice(-chars) : text;
}

/** For other batches' blocks, report only type and approximate length to convey overall structure. */
function briefBlock(block: SkeletonBlock) {
  const chars = blockChars(block);
  const scale = chars > 0 ? `约 ${chars} 字` : '无正文';
  switch (block.kind) {
    case 'paragraph':
      return `段落块 ${block.id}（${scale}）`;
    case 'list':
      return `列表块 ${block.id}（${scale}）`;
    case 'figure':
      return `独立配图块 ${block.id}`;
    case 'imageText':
      return `图文混排块 ${block.id}（${scale}）`;
    case 'figureGroup':
      return `并列图组块 ${block.id}（${block.count} 张）`;
    case 'table':
      return `数据表格块 ${block.id}（${scale}）`;
    default:
      return `块 ${block.id}`;
  }
}

export interface BatchPromptInput {
  plan: SkeletonPlan;
  context: SkeletonPromptContext;
  batches: GenerationBatch[];
  batch: GenerationBatch;
  /** Previously generated batch HTML used to extract continuity context. */
  generatedHtml: string;
}

/**
 * User prompt for one batch. Always provide the full block list and mark the current batch; global context
 * supports transitions, whereas isolated batches would each repeat the introduction.
 */
export function buildBatchUserPrompt(input: BatchPromptInput) {
  const { plan, context, batches, batch, generatedHtml } = input;
  const ids = new Set(batch.blocks.map((block) => block.id));
  const facts = context.globalFacts.trim();

  // Provide full specifications for current blocks and a one-line skeleton for others: the model needs overall structure,
  // but does not need other batches' word ranges and frame options repeated on every request.
  const detailed = describeSkeleton(plan.blocks, true).split('\n');
  const outline = plan.blocks
    .filter((block) => block.kind !== 'heading')
    .map((block, index) => (ids.has(block.id)
      ? `${detailed[index]}   ← 本批要写`
      : `${index + 1}. ${briefBlock(block)}`))
    .join('\n');

  const covered = generatedHtml ? summarizeCovered(generatedHtml) : [];
  const tail = generatedHtml ? tailOf(generatedHtml) : '';

  return `# 项目信息
项目名称：${context.projectName || '（未填写）'}
${context.projectOverview ? `项目概述：${context.projectOverview}` : ''}

# 本节位置
${context.sectionPath}
本节标题：${context.sectionTitle}
${context.sectionDescription ? `本节说明：${context.sectionDescription}` : ''}

${facts ? `# 本节须遵守的事实设定\n${facts}\n` : ''}
# 本节完整块清单（共 ${batches.length} 批，你现在写第 ${batch.index + 1} 批）
${outline}

${tail ? `# 上一批结尾的原文\n${tail}\n\n从这里自然接下去，不要重新开题。\n` : ''}
${covered.length ? `# 前面已经写过的要点（不要重复论述）\n${covered.map((point) => `- ${point}`).join('\n')}\n` : ''}
# 本批要求
只输出上面标了"← 本批要写"的那些块，一块不多一块不少，顺序照旧。
本批正文合计约 ${batch.chars} 字。${batch.index + 1 === batches.length ? '这是最后一批，收束全节。' : '后面还有内容，不要写总结性的收尾。'}`;
}
