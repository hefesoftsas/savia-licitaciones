import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanPreview } from '../src/features/web/plan-preview.mjs';
import { renderPreviewNodes } from '../src/features/web/plan-preview-view.mjs';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('la vista previa conserva imágenes guardadas con atributos de documentos anteriores', () => {
 const assets = [{ id: '22222222-2222-4222-8222-222222222222', kind: 'agent', reference: 'figuras/uno.png' }];
 const output = buildPlanPreview('<figure><img data-xx-asset-ref="figuras/uno.png"></figure>', assets, 'project-1');
 assert.match(JSON.stringify(output), /\/api\/projects\/project-1\/plan-assets\/22222222-2222-4222-8222-222222222222/);
});

test('construye una vista previa segura con imágenes del proyecto y sin activar contenido remoto', () => {
 const reference = 'savia-asset://imported-images/technical-plan-a/plano.png';
 const input = `# Capítulo\n\nTexto **importante**.\n\n![Plano](${reference})\n\n![Externa](https://example.org/pixel.png?token=secreto)\n\n<figure><img data-sv-asset-ref="figuras/uno.png" onerror="alert(1)"><figcaption>Diagrama</figcaption></figure>\n\n<script>contenido_peligroso()</script><iframe src="https://example.org/"></iframe>`;
 const assets = [{ id: '11111111-1111-4111-8111-111111111111', kind: 'url', reference }, { id: '22222222-2222-4222-8222-222222222222', kind: 'agent', reference: 'figuras/uno.png' }];
 const output = buildPlanPreview(input, assets, 'project-1'), serialized = JSON.stringify(output);
 assert.match(serialized, /Texto/); assert.match(serialized, /importante/); assert.match(serialized, /Diagrama/);
 assert.match(serialized, /\/api\/projects\/project-1\/plan-assets\/11111111-1111-4111-8111-111111111111/); assert.match(serialized, /\/api\/projects\/project-1\/plan-assets\/22222222-2222-4222-8222-222222222222/);
 assert.equal(serialized.includes('example.org'), false); assert.equal(serialized.includes('secreto'), false); assert.equal(serialized.includes('onerror'), false); assert.equal(serialized.includes('contenido_peligroso'), false); assert.ok(serialized.includes('missing'));
});

test('no interpreta código como imágenes y permite imágenes embebidas seguras', () => {
 const png = 'data:image/png;base64,iVBORw0KGgo=';
 const output = JSON.stringify(buildPlanPreview(`\`![No](https://evil.test/a)\`\n\n![Local](${png})\n\n<img src="data:image/svg+xml;base64,PHN2Zz4=">`, [], 'project'));
 assert.ok(output.includes('evil.test')); assert.ok(output.includes(png)); assert.equal(output.includes('data:image/svg'), false);
});

test('renderiza el contenido y las imágenes autorizadas sin HTML activo', () => {
 const reference = 'savia-asset://imported-images/technical-plan-a/plano.png', id = '11111111-1111-4111-8111-111111111111';
 const tree = buildPlanPreview(`Texto  \nsiguiente\n\n![Plano](${reference})\n\n<script>alert(1)</script>`, [{ id, kind: 'url', reference }], 'project');
 const html = renderToStaticMarkup(createElement(Fragment, null, renderPreviewNodes(tree, false)));
 assert.match(html, /Texto<br\/>/); assert.match(html, /\/api\/projects\/project\/plan-assets\//); assert.match(html, /alt="Plano"/); assert.equal(html.includes('<script'), false); assert.equal(html.includes('alert(1)'), false);
});

test('limita contenido excesivamente anidado sin bloquear la vista previa', () => {
 const content = '<div>'.repeat(500) + 'interior' + '</div>'.repeat(500);
 const tree = buildPlanPreview(content, [], 'project');
 const html = renderToStaticMarkup(createElement(Fragment, null, renderPreviewNodes(tree, false)));
 assert.match(html, /Vista previa limitada/);
});

test('muestra imágenes propias de la biblioteca y rechaza referencias no autorizadas', () => {
 const id='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',url=`/api/image-library/${id}/file`,otherUrl=`/api/image-library/${other}/file`;
 const tree=buildPlanPreview(`![Plano](${url})\n\n![Ajena](${otherUrl})\n\n![Externa](https://example.org/img.png)`,[], 'project',[{id,missingReason:null,deleting:false}]);
 const html=renderToStaticMarkup(createElement(Fragment,null,renderPreviewNodes(tree,false)));assert.match(html,new RegExp(url));assert.doesNotMatch(html,new RegExp(otherUrl));assert.doesNotMatch(html,/example\.org/);assert.match(html,/no disponible/i);
});
