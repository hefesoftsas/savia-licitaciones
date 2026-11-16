import { createElement, useState } from 'react';

function PreviewImage({ src, alt, en }) {
 const [failed, setFailed] = useState(false);
 if (failed) return createElement('span', { className: 'web-preview-missing', role: 'status' }, `${en ? 'Image unavailable' : 'Imagen no disponible'}${alt ? `: ${alt}` : ''}`);
 return createElement('img', { src, alt: alt || (en ? 'Chapter image' : 'Imagen del capítulo'), loading: 'lazy', onError: () => setFailed(true) });
}

export function renderPreviewNodes(nodes, en, prefix = 'preview') {
 return nodes.map((node, index) => {
  const key = `${prefix}-${index}`;
  if (node.type === 'text') return node.value;
  if (node.type === 'image') return createElement(PreviewImage, { key: `${key}:${node.src}`, src: node.src, alt: node.alt, en });
  if (node.type === 'missing') return createElement('span', { key, className: 'web-preview-missing' }, `${en ? 'Image unavailable' : 'Imagen no disponible'}${node.alt ? `: ${node.alt}` : ''}`);
  if (node.type === 'truncated') return createElement('span', { key, role: 'status' }, en ? 'Preview limited; the saved content is unchanged.' : 'Vista previa limitada; el contenido guardado no cambia.');
  if (node.tag === 'br' || node.tag === 'hr') return createElement(node.tag, { key });
  return createElement(node.tag, { key }, renderPreviewNodes(node.children, en, key));
 });
}
