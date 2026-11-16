import { normalizeSaviaMarkup } from '../../shared/bodyHtml/saviaMarkup.mjs';
import MarkdownIt from 'markdown-it';
import cjkFriendly from 'markdown-it-cjk-friendly';
import taskLists from 'markdown-it-task-lists';
import { load } from 'cheerio/slim';

const markdown = new MarkdownIt({ html: true, linkify: false, typographer: false, breaks: false });
markdown.use(cjkFriendly).use(taskLists, { enabled: true, label: true, labelAfter: true });
const allowed = new Set(['p', 'br', 'hr', 'strong', 'b', 'em', 'i', 's', 'del', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'figure', 'figcaption', 'span', 'div', 'section', 'article', 'sub', 'sup', 'mark']);
const blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript']);

export function buildPlanPreview(content, assets, projectId, library = []) {
 const lookup = new Map();
 for (const asset of assets || []) if (asset && /^[a-f0-9-]{36}$/i.test(asset.id) && ['url', 'agent'].includes(asset.kind) && typeof asset.reference === 'string') lookup.set(JSON.stringify([asset.kind, asset.reference]), asset.id);
 const libraryIds = new Set((library || []).filter(item => item && /^[a-f0-9-]{36}$/i.test(item.id) && !item.missingReason && !item.deleting).map(item => item.id));
 const $ = load(markdown.render(normalizeSaviaMarkup(content || '')), null, false);
 let visited = 0, truncated = false;
 const convert = (node, depth = 0) => {
  if (++visited > 50_000 || depth > 100) { if (truncated) return []; truncated = true; return [{ type: 'truncated' }]; }
  if (node.type === 'text') return [{ type: 'text', value: node.data || '' }];
  if (!['tag', 'script', 'style'].includes(node.type)) return [];
  const tag = String(node.name || '').toLowerCase(); if (blocked.has(tag)) return [];
  if (tag === 'img') {
   const attrs = node.attribs || {}, agent = attrs['data-sv-asset-ref'], reference = agent || attrs.src || '', kind = agent ? 'agent' : 'url', id = lookup.get(JSON.stringify([kind, reference]));
   const alt = String(attrs.alt || '').slice(0, 500);
   if (id) return [{ type: 'image', src: `/api/projects/${encodeURIComponent(projectId)}/plan-assets/${id}`, alt }];
   const libraryMatch = !agent && /^\/api\/image-library\/([a-f0-9-]{36})\/file$/i.exec(reference);
   if (libraryMatch && libraryIds.has(libraryMatch[1])) return [{ type: 'image', src: reference, alt }];
   if (!agent && reference.length <= 8_000_000 && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(reference)) return [{ type: 'image', src: reference, alt }];
   return [{ type: 'missing', alt }];
  }
  const children = (node.children || []).flatMap(child => convert(child, depth + 1));
  return allowed.has(tag) ? [{ type: 'element', tag, children }] : children;
 };
 return $.root().contents().toArray().flatMap(node => convert(node));
}
