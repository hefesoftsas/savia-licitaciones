// Generation methods for new content illustrations; hide disabled methods from agent prompts, references, tools, and validation so the agent cannot plan them.
const IMAGE_KINDS = [
  { kind: 'ai', generation: 'aiImage', label: 'AI 图片', optionKey: 'useAiImages' },
  { kind: 'html', generation: 'htmlImage', label: 'HTML 图片', optionKey: 'useHtmlImages' },
  { kind: 'mermaid', generation: 'mermaid', label: 'Mermaid 图片', optionKey: 'useMermaidImages' },
];
// Format marker for reused original-plan images, unrelated to any generation method.
const ORIGINAL_GENERATION = 'original';
const BLOCK_MARKER = '<!-- savia:block -->';

// A zero illustration ratio means no images and disables every method; single-section edits follow the same rule.
function resolveImageKinds(options) {
  if (!(Number(options?.imageQuantity) > 0)) return [];
  return IMAGE_KINDS.filter(item => options?.[item.optionKey] === true).map(item => item.kind);
}

const enabledKinds = kinds => IMAGE_KINDS.filter(item => kinds.includes(item.kind));

// Allowed data-sv-generation values for new images; check original-image markers separately.
function allowedImageGenerations(kinds) {
  return new Set(enabledKinds(kinds).map(item => item.generation));
}

// Type names used in prompts, such as AI images (aiImage) and HTML images (htmlImage).
function imageKindNames(kinds) {
  return enabledKinds(kinds).map(({ label, generation }) => `${label}（${generation}）`).join('、');
}

function imageGenerationList(kinds) {
  return enabledKinds(kinds).map(item => item.generation).join('/');
}

function imageKindList(kinds) {
  return enabledKinds(kinds).map(item => item.kind).join('/');
}

// Render resource conditions/placeholders: retain <!-- @if html,mermaid -->…<!-- @endif --> if either is enabled; !ai retains when disabled. No nesting support.
function renderImageKindText(text, kinds) {
  const enabled = new Set(kinds);
  return String(text)
    .replace(/<!-- @if (!?)([a-z,]+) -->([\s\S]*?)<!-- @endif -->/g, (_match, negate, names, body) => {
      const hit = names.split(',').some(name => enabled.has(name));
      return (negate ? !hit : hit) ? body : '';
    })
    .replaceAll('{{kinds}}', imageKindList(kinds))
    .replaceAll('{{generations}}', imageGenerationList(kinds))
    .replaceAll('{{kind_mapping}}', enabledKinds(kinds).map(({ kind, generation }) => `${kind} corresponds to ${generation}`).join(', '))
    .replace(/\n{3,}/g, '\n\n');
}

// Keep enabled methods only in comparison tables; when Mermaid is off and HTML on, render former Mermaid types through HTML and add them to allowed HTML types.
function buildImageTypeTable(text, kinds) {
  const enabled = new Set(kinds);
  const remapMermaid = !enabled.has('mermaid') && enabled.has('html');
  const remappedHtmlTypes = [];
  const lines = String(text).split(/\r?\n/).flatMap(line => {
    const match = line.match(/^(.+)=(ai|html|mermaid)$/);
    if (!match || enabled.has(match[2])) return [line];
    if (match[2] === 'mermaid' && remapMermaid) {
      remappedHtmlTypes.push(match[1]);
      return [`${match[1]}=html`];
    }
    return [];
  });
  const content = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { content: `${content || 'No new images in this batch.'}\n`, remappedHtmlTypes };
}

// Rewrite sample image types using the same comparison-table rules; remove entire blocks still using disabled types. Samples demonstrate structure only.
function filterTemplateSample(html, kinds) {
  html = require('../utils/saviaMarkup.cjs').normalizeSaviaMarkup(html);
  const allowed = allowedImageGenerations(kinds);
  const remapMermaid = !kinds.includes('mermaid') && kinds.includes('html');
  const [head, ...blocks] = String(html).split(BLOCK_MARKER);
  const kept = blocks
    .map(block => remapMermaid ? block.replace(/data-sv-generation="mermaid"/g, 'data-sv-generation="htmlImage"') : block)
    .filter(block => [...block.matchAll(/data-sv-generation="([^"]*)"/g)].every(([, generation]) => allowed.has(generation)));
  return [head, ...kept].join(BLOCK_MARKER);
}

module.exports = {
  IMAGE_KINDS, ORIGINAL_GENERATION, resolveImageKinds, allowedImageGenerations, imageKindNames, imageGenerationList, imageKindList,
  renderImageKindText, buildImageTypeTable, filterTemplateSample,
};
