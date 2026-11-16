const { load } = require('cheerio');
const { normalizeSaviaMarkup } = require('./saviaMarkup.cjs');

// Void elements have no closing tag; optional-end-tag elements close naturally with later tags and do not swallow subsequent sections.
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const OPTIONAL_END_ELEMENTS = new Set(['p', 'li', 'dt', 'dd', 'rt', 'rp', 'optgroup', 'option', 'colgroup', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);
const FIGURE_SIZES = new Set(['square', 'wide', 'tall', 'panorama']);
// These containers may hold block-level figures directly; split paragraph, heading, bold, link, and other inline wrappers at image positions.
const FIGURE_CONTAINERS = new Set(['li', 'td', 'th', 'blockquote', 'div', 'section', 'dd']);
// When </ is not followed by a tag name, parsers discard through the next > as a comment. This occurs when model tool markers such as DSML enter content,
// commonly from malformed </template> or interrupted output; skip text inside comments.
const INVALID_END_TAG = /<!--[\s\S]*?(?:-->|$)|<\/(?![A-Za-z])[^>]*>?/g;
const stripInvalidEndTags = html => html.replace(INVALID_END_TAG, match => match.startsWith('</') ? '' : match);
const invalidEndTags = html => [...html.matchAll(INVALID_END_TAG)].filter(match => match[0].startsWith('</'));

// Select only images belonging to this figure, excluding nested figures' images.
const ownImages = ($, node) => $(node).find('img').filter((_index, img) => $(img).closest('figure')[0] === node);

function describe(node) {
  const id = node.attribs?.id;
  const at = node.sourceCodeLocation?.startLine;
  return `${at ? `第 ${at} 行` : ''}<${node.name}${id ? ` id="${id}"` : ''}>`;
}

// Find unclosed elements and image-structure issues; generation saves may also check for source ending inside tags/comments.
function findHtmlStructureIssues(html, { checkSourceCompleteness = false } = {}) {
  const source = normalizeSaviaMarkup(html || '');
  // Parser-reconstructed formatting elements reuse original tag positions; deduplicate by source position and report distinct elements separately.
  const issues = new Map();
  const $ = load(source, {
    sourceCodeLocationInfo: true,
    // Reuse this parse and treat only EOF errors as unfinished source; do not block on recoverable text comparison-symbol warnings.
    onParseError(error) {
      if (!checkSourceCompleteness || !error.code.startsWith('eof-')) return;
      const reason = error.code === 'eof-in-comment' ? '注释尚未结束'
        : error.code === 'eof-in-tag' ? '标签尚未结束'
          : error.code === 'eof-before-tag-name' ? '标签尚未写完' : '元素源码尚未结束';
      issues.set(`${error.startOffset}|${error.code}`,
        `第 ${error.startLine} 行第 ${error.startCol} 列：${reason}（${error.code}）`);
    },
  }, false);
  const add = (node, message) => issues.set(`${node.sourceCodeLocation?.startOffset}|${message}`, message);
  // Malformed markers often cause later unclosed-element issues; list them first so truncated explanations include the cause.
  for (const match of invalidEndTags(source)) {
    issues.set(`${match.index}|invalid`, `第 ${source.slice(0, match.index).split('\n').length} 行出现异常结束标记（</ 后不是标签名），多为模型输出异常，标记之后的内容可能缺失`);
  }
  $('*').each((_index, node) => {
    const location = node.sourceCodeLocation;
    if (location?.startTag && !location.endTag && !VOID_ELEMENTS.has(node.name) && !OPTIONAL_END_ELEMENTS.has(node.name)) {
      add(node, `${describe(node)} 缺少结束标签 </${node.name}>`);
    }
  });
  $('figure').each((_index, node) => {
    const figure = $(node);
    if (figure.parents('figure').length) add(node, `${describe(node)} 嵌套在另一个 figure 中`);
    const direct = figure.children('img').length;
    const wrapped = ownImages($, node).length - direct;
    if (direct !== 1) {
      add(node, direct === 0 && wrapped
        ? `${describe(node)} 的 img 被其他元素包裹，须作为 figure 的直接子元素`
        : `${describe(node)} 须直接包含且仅包含一个 img，当前为 ${direct} 个`);
    }
    if (!FIGURE_SIZES.has((figure.attr('data-sv-size') || '').trim())) add(node, `${describe(node)} 缺少合法的 data-sv-size`);
  });
  $('img').each((_index, node) => {
    if (!$(node).closest('figure').length) add(node, `${describe(node)} 须放在 figure 内`);
  });
  return [...issues.values()];
}

// Prompt templates contain text only. A malformed </template> can swallow following images, captions, and section content into the template;
// restore losslessly by closing before its first child element and removing malformed markers. Reparse after each repair until no repairable template remains.
function closeOpenTemplates(html) {
  let source = normalizeSaviaMarkup(html || '');
  let closed = 0;
  for (;;) {
    const $ = load(source, { sourceCodeLocationInfo: true }, false);
    const target = $('template').toArray().map(node => [node, node.children[0]?.children?.find(child => child.type === 'tag')])
      .find(([node, first]) => node.sourceCodeLocation?.startTag && !node.sourceCodeLocation.endTag
        && first?.sourceCodeLocation?.startOffset >= node.sourceCodeLocation.startTag.endOffset);
    if (!target) return { html: source, closed };
    const [node, first] = target;
    const start = node.sourceCodeLocation.startTag.endOffset;
    const end = first.sourceCodeLocation.startOffset;
    const inner = stripInvalidEndTags(source.slice(start, end));
    const prompt = inner.trimEnd();
    source = `${source.slice(0, start)}${prompt}</template>${inner.slice(prompt.length)}${source.slice(end)}`;
    closed += 1;
  }
}

// Validate before saving; throw issue descriptions directly usable for agent repair.
function assertHtmlStructure(html, options) {
  const issues = findHtmlStructureIssues(html, options);
  if (issues.length) {
    throw new Error(`HTML 结构不完整，请修正后重新保存：${issues.slice(0, 8).join('；')}${issues.length > 8 ? `；另有 ${issues.length - 8} 处` : ''}。除 img 等空元素外，每个元素都要写出结束标签；每个 figure 以 </figure> 结束，并直接包含一个 img。`);
  }
}

// Wrap standalone images in figures in place: split paragraph/heading/inline wrappers outward at the image, moving following content into new same-name elements;
// insert the figure between the two parts to preserve order. Split multiple images sequentially and delete whitespace-only remnants.
function placeFigure($, img, figure) {
  let node = img[0];
  let tail = null;
  while (node.parent?.type === 'tag' && !FIGURE_CONTAINERS.has(node.parent.name)) {
    const parent = node.parent;
    const rest = parent.children.slice(parent.children.indexOf(node) + 1);
    tail = null;
    if (rest.length) {
      const { id: _id, ...attributes } = parent.attribs;
      tail = $(`<${parent.name}></${parent.name}>`).attr(attributes).append(rest);
      $(parent).after(tail);
    }
    node = parent;
  }
  if (node === img[0]) {
    img.replaceWith(figure);
    return;
  }
  $(node).after(figure);
  img.remove();
  for (const part of [$(node), tail].filter(Boolean)) {
    if (!part.text().trim() && !part.find('img, table, figure').length) part.remove();
  }
}

// For continued full export: parse sections independently to close missing tags and normalize figures for Word conversion.
// Repair prompt-template endings and malformed markers first, restoring swallowed images/content before later figure cleanup can remove them.
function repairHtmlStructure(html) {
  const templates = closeOpenTemplates(html);
  const markers = invalidEndTags(templates.html).length;
  const $ = load(stripInvalidEndTags(templates.html), null, false);
  const repairs = [];
  if (templates.closed) repairs.push(`补齐 ${templates.closed} 处提示词结束标签 </template>`);
  if (markers) repairs.push(`删除 ${markers} 处异常结束标记`);
  const label = figure => `figure${figure.attr('id') ? `#${figure.attr('id')}` : ''}`;
  // Document order is outer-to-inner: move misplaced body content and nested figures after their enclosing figure before processing moved figures themselves.
  for (const node of $('figure').toArray()) {
    const figure = $(node);
    if (!figure.children('img').length) {
      const wrapped = ownImages($, node).first();
      if (wrapped.length) {
        figure.prepend(wrapped);
        repairs.push(`${label(figure)} 的图片移为直接子元素`);
      }
    }
    if (!FIGURE_SIZES.has((figure.attr('data-sv-size') || '').trim())) {
      figure.attr('data-sv-size', 'wide');
      repairs.push(`${label(figure)} 补充画框比例`);
    }
    // Split extra images into same-ratio figures; move misplaced content/nested figures afterward in original order.
    const frame = { 'data-sv-size': figure.attr('data-sv-size'), ...(figure.attr('data-sv-fit') ? { 'data-sv-fit': figure.attr('data-sv-fit') } : {}) };
    const [image, ...extraImages] = figure.children('img').toArray();
    let anchor = figure;
    for (const child of figure.contents().toArray()) {
      if (child === image || ['figcaption', 'template'].includes(child.name)) continue;
      if (child.type === 'text' && !child.data.trim()) continue;
      const moved = extraImages.includes(child) ? $('<figure></figure>').attr(frame).append(child)
        : child.type === 'text' ? $('<p></p>').text(child.data.trim()) : $(child);
      if (child.type === 'text') $(child).remove();
      anchor.after(moved);
      anchor = moved;
    }
    if (anchor !== figure) repairs.push(`${label(figure)} 内的其他内容移到图片之后`);
    if (!image) {
      figure.remove();
      repairs.push(`移除缺少图片的 ${label(figure)}`);
    }
  }
  for (const node of $('img').toArray()) {
    const img = $(node);
    if (img.closest('figure').length) continue;
    placeFigure($, img, $('<figure data-sv-size="wide" data-sv-fit="contain"></figure>').append(img.clone()));
    repairs.push('游离图片放入 figure');
  }
  return { html: $.html(), repairs: [...new Set(repairs)] };
}

module.exports = { findHtmlStructureIssues, assertHtmlStructure, closeOpenTemplates, repairHtmlStructure, ownImages };
