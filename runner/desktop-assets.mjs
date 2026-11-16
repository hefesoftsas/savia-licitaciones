import { createRequire } from 'node:module';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const MarkdownIt = require('markdown-it');
const cheerio = require('cheerio');
const { normalizeSaviaMarkup } = require('./electron/utils/saviaMarkup.cjs');
const markdown = new MarkdownIt({ html: true });
const cjkFriendly = require('markdown-it-cjk-friendly');
markdown.use(cjkFriendly.default || cjkFriendly).use(require('markdown-it-task-lists'), { enabled: true, label: true, labelAfter: true });

export function imageReferences(content) {
 const found = [];
 const html = source => {
  const $ = cheerio.load(normalizeSaviaMarkup(source), null, false);
  $('img').each((_index, element) => {
   const image = $(element), ref = image.attr('data-sv-asset-ref'), src = image.attr('src');
   if (ref) found.push({ kind: 'agent', reference: ref });
   else if (src) found.push({ kind: 'url', reference: src });
  });
 };
 const scan = tokens => { for (const token of tokens) {
  if (token.type === 'image') found.push({ kind: 'url', reference: token.attrGet('src') });
  else if (token.type === 'html_inline' || token.type === 'html_block') html(token.content);
  if (token.children) scan(token.children);
 } };
 scan(markdown.parse(content || '', {}));
 return found;
}

export function safeParts(value) {
 if (!value || /[?#\\]/.test(value)) return null;
 try {
  const parts = value.split('/').map(decodeURIComponent);
  if (parts.some(part => !part || part === '.' || part === '..' || /[\\/:\x00-\x1f\x7f]/.test(part))) return null;
  return parts;
 } catch { return null; }
}
export function supportedImage(bytes) {
 const starts = signature => signature.every((value, index) => bytes[index] === value);
 return starts([137,80,78,71,13,10,26,10]) || starts([255,216,255]) || starts([71,73,70,56,55,97]) || starts([71,73,70,56,57,97]) || (bytes.length >= 12 && starts([82,73,70,70]) && [87,69,66,80].every((value, index) => bytes[index + 8] === value));
}

function archivePath(item, snapshot) {
 const prefix = snapshot ? `technical-plan-projects/${snapshot}/` : '';
 if (item.kind === 'agent') {
  const parts = safeParts(item.reference);
  return parts ? { path: `${snapshot ? `${prefix}technical-plan-content-generation/` : 'agent-runtime/pi/tasks/technical-plan-content-generation/'}workspace/${parts.join('/')}` } : { reason: 'unsafe_path' };
 }
 if (/^data:/i.test(item.reference)) return { embedded: true };
 const match = /^savia-asset:\/\/(imported-images|generated-images)\/(.*)$/i.exec(item.reference);
 if (!match) return { reason: 'outside_backup' };
 const parts = safeParts(match[2]); if (!parts) return { reason: 'unsafe_path' };
 if (match[1].toLowerCase() === 'imported-images') return { path: `${snapshot ? `${prefix}imported/` : 'workspace/imported-images/'}${parts.join('/')}` };
 if (parts[0] !== 'technical-plan' || parts.length < 2) return { reason: 'outside_backup' };
 return { path: `${snapshot ? `${prefix}generated/` : 'workspace/generated-images/technical-plan/'}${parts.slice(1).join('/')}` };
}

export function extractDesktopAssets(nodes, files, snapshot) {
 const assets = [], missingAssets = [], seen = new Set();
 for (const node of nodes) for (const item of imageReferences(node.content)) {
  if (!item.reference) continue;
  const identity = `${item.kind}\0${item.reference}`; if (seen.has(identity)) continue; seen.add(identity);
  if (seen.size > 1000) throw new Error('El plan contiene demasiadas referencias de imágenes.');
  const resolved = archivePath(item, snapshot); if (resolved.embedded) continue;
  if (resolved.reason) { missingAssets.push({ ...item, reason: resolved.reason }); continue; }
  const bytes = files.get(resolved.path);
  if (!bytes) { missingAssets.push({ ...item, reason: 'not_found' }); continue; }
  if (bytes.length > 25 * 1024 * 1024) { missingAssets.push({ ...item, reason: 'too_large' }); continue; }
  if (!supportedImage(bytes)) { missingAssets.push({ ...item, reason: 'unsupported_format' }); continue; }
  assets.push({ ...item, bytes });
 }
 return { assets, missingAssets };
}
