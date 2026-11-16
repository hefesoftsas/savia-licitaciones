import { normalizeSaviaMarkup } from '../bodyHtml/saviaMarkup.mjs';
import brand from '../../../brand.json' with { type: 'json' };
/**
 * Skeleton -> AI instructions -> restricted HTML assembly. AI receives only block lists and word ranges,
 * with no centimeters, line counts, page numbers, or layout terminology. Keep layout knowledge in code; AI
 * writes content and image prompts while the program supplies size attributes.
 */
import type { SkeletonBlock, SkeletonPlan } from './sectionSkeleton';
import { resolveFigureSize } from './sectionSkeleton';
import { DEFAULT_FIGURE_FIT, FIGURE_GEOMETRY } from './pageMetrics';
import type { FigureFit, FigureGeneration, FigureSize } from './pageMetrics';

/**
 * Placeholder images: this test validates layout, which depends on frame dimensions rather than image
 * content, so reuse sample images without image generation. C# crops centrally to frame ratios, letting any
 * image fill any frame. Rotate images so a section does not look like it reused the same ungenerated image
 * everywhere.
 */
const PLACEHOLDER_ASSETS = [
  'assets/standard-quality-control.webp',
  'assets/visual-wbs-mindmap.webp',
  'assets/visual-technical-architecture.webp',
  'assets/visual-quality-closed-loop.webp',
  'assets/visual-master-plan-scene.webp',
];

const SHAPE_HINT: Record<FigureSize, string> = {
  tall: 'tall（竖版 3:4，适合自上而下的流程、分层结构）',
  square: 'square（方形 1:1，适合闭环、矩阵、九宫格）',
  wide: 'wide（横版 3:2，适合左右流向、并列对比）',
  panorama: 'panorama（宽幅 16:9，适合长横向时间轴、全景架构）',
};

const ROLE_HINT: Record<string, string> = {
  lead: '开篇，点明本节要解决什么问题',
  body: '主体论述，展开具体做法',
  bridge: '承接过渡，把上文的做法引向下文',
  close: '收束，说明成效或与后续工作的衔接',
};

/**
 * Render the skeleton as an itemized block list. forAi omits headings because the program constructs them
 * from section titles and body generation writes only body content. Keep headings in the skeleton because
 * packing must count their height.
 */
export function describeSkeleton(blocks: SkeletonBlock[], forAi = false) {
  const visible = forAi ? blocks.filter((block) => block.kind !== 'heading') : blocks;
  return visible.map((block, index) => {
    const order = index + 1;
    switch (block.kind) {
      case 'heading':
        return `${order}. 标题块（h${block.level}，由程序输出）：${block.text}`;
      case 'paragraph':
        return `${order}. 段落块 ${block.id}：${block.minChars}-${block.maxChars} 字，${ROLE_HINT[block.role] || '主体论述'}`;
      case 'list':
        return `${order}. ${block.ordered ? '有序' : '无序'}列表块 ${block.id}：${block.items} 项，每项 ${block.charsPerItem} 字左右`;
      case 'figure':
        return `${order}. 独立配图块 ${block.id}：建议用 ${block.suggestedGeneration}（内容明显不适合可改）；`
          + `可选画框 ${block.allowedSizes.map((size) => SHAPE_HINT[size]).join('、')}`;
      case 'imageText':
        return `${order}. 图文混排块 ${block.id}：左图右文的两栏表格。`
          + `左格放一张配图（id 用 ${block.figureId}，建议 ${block.suggestedGeneration}，`
          + `画框固定用 ${block.size}，不要改），`
          + `右格写 ${block.minChars}-${block.maxChars} 字说明这张图表达的做法；`
          + `${block.maxChars} 字是硬上限，超过会把这一行撑高、顶到下一页留出空白`;
      case 'figureGroup':
        return `${order}. 并列图组块 ${block.id}：${block.count === 3 ? '一行三列' : '两行两列四宫格'}，`
          + `${block.count} 张同一主题下互相并列的图（id 依次用 ${block.figureIds.join('、')}，`
          + `建议 ${block.suggestedGeneration}，画框统一用 ${block.allowedSizes[0]}）`;
      case 'table':
        return `${order}. 数据表格块 ${block.id}：${block.preset} 预设，`
          + `${block.cols} 列 ${block.rows} 行数据${block.hasHeader ? '加一行表头' : ''}，`
          + `用来归纳可对比的事实，不要把正文段落塞进表格`;
      default:
        return `${order}. 未知块`;
    }
  }).join('\n');
}

export interface SkeletonPromptContext {
  projectName: string;
  projectOverview: string;
  sectionPath: string;
  sectionTitle: string;
  sectionDescription: string;
  globalFacts: string;
}

export function buildSkeletonSystemPrompt() {
  return `你是投标文件正文撰写助手，只输出受限 HTML 正文流。

输出格式：
- 每个块前面单独一行 <!-- savia:block --> 注释，块与块之间空一行。
- 只允许这些标签：p、ol、ul、li、figure、img、figcaption、template、table、caption、thead、tbody、tr、th、td；
  行内只允许 strong、em、u、sup、sub、br。
- 不输出 style、class、CSS、宽高、颜色、对齐、分页信息，不输出 markdown 代码围栏。
- 每个块元素带一个 id 属性，用给定的块编号，例如 <p id="p1">。
- 不要输出任何标题（h1-h6）。本节标题由程序用目录里的小节标题直接拼出来，你只写正文。

配图块的写法：
<!-- savia:block -->
<figure id="fig1" data-sv-generation="生成方式" data-sv-size="画框">
  <template data-sv-role="prompt">这里写配图生成提示词，说清楚画什么、有哪些节点和关系</template>
  <img alt="图片内容的简短描述">
  <figcaption>图例文字</figcaption>
</figure>

data-sv-generation 三选一，按这张图真正该画什么来选，不要固定用同一种：
- mermaid：有明确先后或从属关系的流程图、层级图、职责关系图；
- htmlImage：组织架构、矩阵、看板、指标卡、架构拓扑这类需要排版的信息图；
- aiImage：施工现场、设备、环境、实施场景这类需要写实画面的效果图。
一节里有多张图时，尽量让它们用不同的生成方式，不要全用同一种。

data-sv-size 从块清单为该图列出的可选画框里挑一个，按内容的自然形状选：
自上而下的长流程用竖版，左右流向或并列对比用横版，闭环和矩阵用方形。

图文混排块（左图右文）的写法：
<!-- savia:block -->
<table id="mix1" data-sv-preset="imageText">
  <caption>这一块的小标题</caption>
  <tbody>
    <tr>
      <td><figure id="fig2" data-sv-generation="htmlImage" data-sv-size="tall">…同上…</figure></td>
      <td><p><strong>一句话要点</strong></p><p>结合左图展开的说明文字</p></td>
    </tr>
  </tbody>
</table>

并列图组块的写法（三列用 threeImages，四宫格用 fourImages，四宫格写两行两列）：
<!-- savia:block -->
<table id="grp1" data-sv-preset="threeImages">
  <caption>这一组图的总标题</caption>
  <tbody>
    <tr>
      <td><figure id="fig3" …>…</figure></td>
      <td><figure id="fig4" …>…</figure></td>
      <td><figure id="fig5" …>…</figure></td>
    </tr>
  </tbody>
</table>
一组图必须是同一主题下互相并列、可比较的几个侧面，不要凑数；
组里每张图都必须有自己的 figcaption，整组再有一个 caption 作为总标题。
图文混排块的左图不需要 figcaption。

数据表格块的写法（preset 用块清单指定的那个）：
<!-- savia:block -->
<table id="tbl1" data-sv-preset="headerRow">
  <caption>表题</caption>
  <thead><tr><th scope="col">列名</th>…</tr></thead>
  <tbody><tr><td>单元格</td>…</tr></tbody>
</table>
headerRow 只有表头行；headerColumn 只有首列表头，首列写成 <th scope="row">；
headerRowAndColumn 两者都有。表格用来归纳可对比的事实，每格控制在 20 字以内。

硬性要求：
- 一节正文可能分几批写。块清单永远给完整的那一份，但你每次只输出标了"本批要写"的块，
  其余的块一个都不要输出。本批之内块的数量、顺序、类型都不能改。
- 每个段落块的字数必须落在给定区间内，这是硬指标。中文按字符计。
- 配图块前后必须各有正文块，绝不允许两个配图块相邻。
- 只输出 HTML，不要任何解释、前言或结语。`;
}

export function buildSkeletonUserPrompt(plan: SkeletonPlan, context: SkeletonPromptContext) {
  const facts = context.globalFacts.trim();
  return `# 项目信息
项目名称：${context.projectName || '（未填写）'}
${context.projectOverview ? `项目概述：${context.projectOverview}` : ''}

# 本节位置
${context.sectionPath}
本节标题：${context.sectionTitle}
${context.sectionDescription ? `本节说明：${context.sectionDescription}` : ''}

${facts ? `# 本节须遵守的事实设定\n${facts}\n` : ''}
# 块清单（严格按此输出，标题不在其中，由程序补）
${describeSkeleton(plan.blocks, true)}

正文合计约 ${plan.plannedChars} 字。请按块清单逐块撰写专业、具体、可执行的投标正文，避免空话套话。`;
}

/** Strip code fences and extra explanation from model output, retaining only HTML. */
export function extractHtml(raw: string) {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const first = body.search(new RegExp("<(?:!--\\s*(?:savia|__BRAND_SLUG__):block|h[1-6]|p|ol|ul|figure|table)\\b".replaceAll('__BRAND_SLUG__', brand.slug), "i"));
  return first > 0 ? body.slice(first).trim() : body;
}

export interface AssembleResult {
  html: string;
  /** Number of attributes supplied by the program, confirming assembly took effect. */
  patchedFigures: number;
  /** Extra model-generated headings removed by the program; normally zero. */
  strippedHeadings: number;
  /** Comparison of actual AI output blocks with the skeleton. */
  blockDiff: { expected: number; actual: number; figureExpected: number; figureActual: number };
  /** Specifications and model-written prompts for each image, passed directly to image generation. */
  figures: AssembledFigure[];
}

/** Model-selected generation method; return undefined when absent or invalid so the skeleton suggestion applies. */
function normalizeGeneration(value: string | null): FigureGeneration | undefined {
  const text = String(value || '').trim();
  return text === 'aiImage' || text === 'htmlImage' || text === 'mermaid' ? text : undefined;
}

/** Model-selected frame; return undefined when invalid so layout chooses a default. */
function normalizeSize(value: string | null): FigureSize | undefined {
  const text = String(value || '').trim() as FigureSize;
  return text in FIGURE_GEOMETRY ? text : undefined;
}

export interface AssembledFigure {
  id: string;
  size: FigureSize;
  /** Frame originally requested by the model; a difference from size indicates a layout downgrade. */
  requestedSize?: FigureSize;
  downgraded: boolean;
  generation: FigureGeneration;
  fit: FigureFit;
  prompt: string;
  caption: string;
  alt: string;
  /** Frame ratio used by image generation for canvas sizing or cropping. */
  aspectWidth: number;
  aspectHeight: number;
}

/**
 * Complete AI HTML into renderable restricted HTML by adding data-sv-size and placeholder references to
 * figures in skeleton order. Sizes come from layout planning, never the model.
 */
export function assembleRestrictedHtml(
  rawHtml: string,
  plan: SkeletonPlan,
  /** Actually generated images keyed by block ID; missing images use placeholders. */
  assetRefs: Record<string, string> = {},
): AssembleResult {
  const html = extractHtml(rawHtml);
  const parser = new DOMParser();
  const document = parser.parseFromString(`<body>${normalizeSaviaMarkup(html)}</body>`, 'text/html');
  // Headings belong to the program; remove any model-written headings to avoid duplication.
  let strippedHeadings = 0;
  for (const heading of Array.from(document.body.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
    heading.remove();
    strippedHeadings += 1;
  }

  // Images may be inside mixed image/text or group tables; collect them in document order.
  // Expand skeleton image slots in the same order to obtain a one-to-one mapping.
  const figures = Array.from(document.body.querySelectorAll('figure'));
  const planned = plan.blocks.flatMap((block) => {
    if (block.kind === 'figure') {
      return [{ id: block.id, allowedSizes: block.allowedSizes, suggested: block.suggestedGeneration }];
    }
    if (block.kind === 'imageText') {
      // Layout fixes this frame, so provide one candidate and replace any different model choice.
      return [{ id: block.figureId, allowedSizes: [block.size], suggested: block.suggestedGeneration }];
    }
    if (block.kind === 'figureGroup') {
      return block.figureIds.map((id) => ({
        id,
        allowedSizes: block.allowedSizes,
        suggested: block.suggestedGeneration,
      }));
    }
    return [];
  });

  let patched = 0;
  const assembledFigures: AssembledFigure[] = [];
  figures.forEach((figure, index) => {
    const spec = planned[index];
    if (!spec) return;
    const asset = assetRefs[spec.id] || PLACEHOLDER_ASSETS[index % PLACEHOLDER_ASSETS.length];

    // Follow the model's generation method; if absent or invalid, use the skeleton's rotated suggestion.
    const generation = normalizeGeneration(figure.getAttribute('data-sv-generation')) || spec.suggested;
    // Follow model frame choices within layout limits; downgrade over-budget frames to the nearest available one.
    const wanted = normalizeSize(figure.getAttribute('data-sv-size'));
    const { size, downgraded } = resolveFigureSize(wanted, spec.allowedSizes);
    // Do not crop any pixels from flowcharts or infographics; crop only photographs.
    const fit: FigureFit = DEFAULT_FIGURE_FIT[generation];
    const geometry = FIGURE_GEOMETRY[size];

    assembledFigures.push({
      id: spec.id,
      size,
      requestedSize: wanted,
      downgraded,
      generation,
      fit,
      // Template text resides in its content fragment; the element's own textContent is always empty.
      // Reading the element directly loses all detailed model image requirements. Match restrictedHtml validation semantics.
      prompt: figure.querySelector('template')?.content.textContent?.trim() || '',
      caption: figure.querySelector('figcaption')?.textContent?.trim() || '',
      alt: figure.querySelector('img')?.getAttribute('alt') || '',
      aspectWidth: geometry.aspectWidth,
      aspectHeight: geometry.aspectHeight,
    });

    figure.setAttribute('data-sv-size', size);
    figure.setAttribute('data-sv-generation', generation);
    figure.setAttribute('data-sv-fit', fit);
    figure.setAttribute('id', spec.id);
    const image = figure.querySelector('img');
    if (image) {
      image.setAttribute('data-sv-asset-ref', asset);
      image.setAttribute('src', asset);
    }
    patched += 1;
  });

  // The renderer splits on <!-- savia:block -->; add missing markers at top-level elements when AI omits them.
  const bodyBlocks = Array.from(document.body.children)
    .map((element) => `<!-- savia:block -->\n${element.outerHTML}`);

  // Construct the heading from the section title and place it before the body.
  const headingSpec = plan.blocks.find((block) => block.kind === 'heading') as
    Extract<SkeletonBlock, { kind: 'heading' }> | undefined;
  const headingHtml = headingSpec
    ? `<!-- savia:block -->\n<h${headingSpec.level} id="${headingSpec.id}">${escapeText(headingSpec.text)}</h${headingSpec.level}>`
    : '';

  const serialized = [headingHtml, ...bodyBlocks].filter(Boolean).join('\n\n');

  return {
    html: serialized,
    patchedFigures: patched,
    strippedHeadings,
    figures: assembledFigures,
    blockDiff: {
      // The program supplies skeleton heading blocks; the model provides only remaining blocks.
      expected: plan.blocks.filter((block) => block.kind !== 'heading').length,
      actual: document.body.children.length,
      // planned already expands image slots inside image groups and mixed image/text.
      figureExpected: planned.length,
      figureActual: figures.length,
    },
  };
}

/** Section titles are plain text; escape them before inserting into HTML so angle brackets cannot break structure. */
function escapeText(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Split assembled HTML into blocks and count actual words per block for quota comparison. */
export function measureBlocks(html: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(`<body>${normalizeSaviaMarkup(html)}</body>`, 'text/html');
  return Array.from(document.body.children).map((element) => {
    const tag = element.tagName.toLowerCase();
    const preset = element.getAttribute('data-sv-preset') || '';
    return {
      id: element.getAttribute('id') || '',
      tag: preset ? `${tag}/${preset}` : tag,
      chars: countBlockChars(element),
    };
  });
}

/**
 * Body words within a block exclude image-generation prompts and captions; mixed image/text counts only
 * right-column explanation text.
 */
function countBlockChars(element: Element) {
  const clone = element.cloneNode(true) as Element;
  for (const node of Array.from(clone.querySelectorAll('template, figcaption, caption'))) {
    node.remove();
  }
  return (clone.textContent || '').replace(/\s+/g, '').length;
}
