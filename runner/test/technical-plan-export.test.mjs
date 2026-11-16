import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { exportTechnicalPlan, resolvePackagedHelper } from '../technical-plan-export.mjs';
const require = createRequire(new URL('../../client/package.json', import.meta.url));
const AdmZip = require('adm-zip');

test('el runner convierte capítulos y Markdown con el helper real y limpia sus temporales', { timeout: 240000, skip: process.env.SAVIA_TEST_OPENXML !== '1' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-export-test-'));
  try {
    const imageReference = 'savia-asset://imported-images/technical-plan-a/plano.png';
    const webpReference = 'savia-asset://imported-images/technical-plan-a/foto.webp';
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=', 'base64');
    const webp = await readFile(new URL('../../client/assets/content-template-preview/visual-master-plan-scene.webp', import.meta.url));
    const result = await exportTechnicalPlan({ projectTitle: 'Oferta de prueba', exportFormat: {page: {paper_size: 'letter', orientation: 'landscape'}}, planAssets: [{ kind: 'url', reference: imageReference, contentType: 'image/png', bytes: image }, { kind: 'url', reference: webpReference, contentType: 'image/webp', bytes: webp }], outline: [
      { id: 'one', number: '1', title: 'Alcance', content_mode: 'manual-fill', content: 'Texto **destacado** para la propuesta.', children: [] },
      { id: 'two', number: '2', title: 'Servicio', content_mode: 'manual-fill', content: 'Descripción del servicio.', children: [] },
      { id: 'three', number: '3', title: 'Método', content_mode: 'ai-generate', content: `Contenido guardado **del método**.\n\n![Plano](${imageReference})\n\n![Foto](${webpReference})`, children: [] },
    ] }, { language: 'es', tempRoot: root, executablePath: process.env.SAVIA_OPENXML_TEST_EXE || undefined });
    const zip = new AdmZip(result.bytes), doc = zip.readAsText('word/document.xml');
    assert.match(doc, /w:orient="landscape"/); assert.match(doc, /Oferta de prueba/); assert.match(doc, /Alcance/); assert.match(doc, /destacado/); assert.match(doc, /Descripción del servicio/); assert.match(doc, /Contenido guardado/); assert.match(doc, /del método/);
    const embedded = zip.getEntries().filter(entry => /^(?:word\/)?media\//.test(entry.entryName)); assert.equal(embedded.length, 2); assert.ok(embedded.some(entry => entry.getData().equals(image))); assert.ok(embedded.every(entry => entry.getData().subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))); assert.ok(embedded.every(entry => zip.readAsText('word/_rels/document.xml.rels').includes(entry.entryName)));
    assert.ok(Array.isArray(result.warnings));
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rechaza un plan sin capítulos antes de iniciar el helper', async () => {
  await assert.rejects(exportTechnicalPlan({ projectTitle: 'Oferta', outline: [] }), /capítulos|chapters/i);
});

test('exporta el texto guardado de capítulos de IA y mantiene el plan original', async () => {
 const root = await mkdtemp(join(tmpdir(), 'savia-export-saved-ai-')); let rendered = '';
 const outline = [{ id: 'parent', number: '1', title: 'Oferta', children: [{ id: 'child', number: '1.1', title: 'Método', content_mode: 'ai-generate', content: 'Texto **guardado** del capítulo.', children: [] }, { id: 'empty', number: '1.2', title: 'Pendiente', content_mode: 'ai-generate', content: '', children: [] }] }];
 const before = JSON.stringify(outline);
 try {
  const result = await exportTechnicalPlan({ projectTitle: 'Proyecto', outline }, { tempRoot: root, createHelper: () => ({ createRestrictedHtmlDocx: async html => { rendered = html; return { bytes: Buffer.from('word'), imageWarnings: [] }; }, close: async () => {} }) });
  assert.match(rendered, /Texto\s*<strong>guardado<\/strong>\s*del capítulo/); assert.match(rendered, /sección está incompleta/); assert.ok(result.warnings.some(warning => warning.includes('Pendiente'))); assert.equal(JSON.stringify(outline), before); assert.deepEqual(await readdir(root), []);
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('resuelve imágenes del plan y conserva el texto cuando falta una imagen', async () => {
 const root = await mkdtemp(join(tmpdir(), 'savia-export-images-')); let rendered, receivedAssets;
 const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=', 'base64');
 const reference = 'savia-asset://imported-images/technical-plan-a/plano.png';
 try {
  const result = await exportTechnicalPlan({ projectTitle: 'Proyecto', outline: [{ id: 'a', title: 'Plano', number: '1', content_mode: 'ai-generate', content: `Texto preservado\n\n![Plano](${reference})\n\n![Ausente](savia-asset://imported-images/falta.png)`, children: [] }], planAssets: [{ kind: 'url', reference, contentType: 'image/png', bytes }] }, { tempRoot: root, createHelper: () => ({ createRestrictedHtmlDocx: async (html, _config, options) => { rendered = html; receivedAssets = options.assets; return { bytes: Buffer.from('word'), imageWarnings: [] }; }, close: async () => {} }) });
  assert.match(rendered, /Texto preservado/); assert.match(rendered, /data-sv-asset-ref="export-images\/0.png"/); assert.deepEqual(receivedAssets.get('export-images/0.png'), bytes); assert.match(rendered, /No se pudo exportar la imagen/); assert.equal(result.warnings.length, 1);
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('convierte WebP importado y embebido a PNG para Word', async () => {
 const root = await mkdtemp(join(tmpdir(), 'savia-export-webp-'));
 const bytes = await readFile(new URL('../../client/assets/content-template-preview/visual-master-plan-scene.webp', import.meta.url));
 const reference = 'savia-asset://imported-images/plano.webp';
 try {
  const result = await exportTechnicalPlan({ projectTitle: 'Proyecto', planAssets: [{ kind: 'url', reference, contentType: 'image/webp', bytes }], outline: [{ id: 'a', title: 'Plano', content_mode: 'manual-fill', content: `![Plano](${reference})\n\n![Embebida](data:image/webp;base64,${bytes.toString('base64')})`, children: [] }] }, { tempRoot: root, createHelper: () => ({ createRestrictedHtmlDocx: async (_html, _config, options) => {
   assert.equal(options.assets.size, 2);
   for (const [name, data] of options.assets) { assert.match(name, /\.png$/); assert.deepEqual(data.subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex')); }
   return { bytes: Buffer.from('word'), imageWarnings: [] };
  }, close: async () => {} }) });
  assert.deepEqual(result.warnings, []);
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('informa un WebP dañado sin perder el texto del capítulo', async () => {
 const root = await mkdtemp(join(tmpdir(), 'savia-export-invalid-webp-'));
 const reference = 'savia-asset://imported-images/danada.webp';
 try {
  const result = await exportTechnicalPlan({ projectTitle: 'Proyecto', planAssets: [{ kind: 'url', reference, contentType: 'image/webp', bytes: Buffer.from('invalid') }], outline: [{ id: 'a', title: 'Plano', content_mode: 'manual-fill', content: `Texto conservado\n\n![Imagen](${reference})`, children: [] }] }, { tempRoot: root, createHelper: () => ({ createRestrictedHtmlDocx: async (html, _config, options) => {
   assert.match(html, /Texto conservado/); assert.match(html, /No se pudo exportar la imagen/); assert.equal(options.assets.size, 0);
   return { bytes: Buffer.from('word'), imageWarnings: [] };
  }, close: async () => {} }) });
  assert.equal(result.warnings.length, 1);
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('la tarea descarga solo imágenes referenciadas y comprueba la versión antes de entregar', async () => {
 const { createWordExportHandler } = await import('../technical-plan-export.mjs'); const reference = 'savia-asset://imported-images/technical-plan-a/plano.png'; let checks = 0; const fetched = [];
 const snapshot = { projectTitle: 'Proyecto', outline: [{ id: 'parent', content: '![No exportada](savia-asset://imported-images/no-usado.png)', children: [{ id: 'a', content: `![Plano](${reference})`, children: [] }] }], assets: [{ id: 'used', kind: 'url', reference, contentType: 'image/png' }, { id: 'unused', kind: 'url', reference: 'savia-asset://imported-images/no-usado.png', contentType: 'image/png' }] };
 const handler = createWordExportHandler({ convert: async value => { assert.equal(value.planAssets.length, 1); assert.equal(value.planAssets[0].id, 'used'); return { bytes: Buffer.from('word'), warnings: [] }; } });
 const result = await handler({ language: 'es' }, { signal: new AbortController().signal, getPlanContext: async () => { checks++; return snapshot; }, getPlanAsset: async id => { fetched.push(id); return Buffer.from('image'); }, uploadArtifact: async () => ({ id: 'artifact' }) });
 assert.equal(result.artifactId, 'artifact'); assert.deepEqual(fetched, ['used']); assert.equal(checks, 2);
});

test('una imagen ausente deja un aviso, pero una concesión inválida interrumpe la entrega', async () => {
 const { createWordExportHandler } = await import('../technical-plan-export.mjs'); const reference = 'savia-asset://imported-images/technical-plan-a/plano.png', snapshot = { projectTitle: 'Proyecto', outline: [{ id: 'a', title: 'Capítulo', content_mode: 'manual-fill', content: `Texto\n\n![Plano](${reference})`, children: [] }], assets: [{ id: 'asset', kind: 'url', reference, contentType: 'image/png' }] }; let uploaded = 0;
 const handler = createWordExportHandler({ convert: async value => { assert.equal(value.planAssets.length, 0); return { bytes: Buffer.from('word'), warnings: ['Imagen no disponible'] }; } });
 const context = { signal: new AbortController().signal, getPlanContext: async () => snapshot, getPlanAsset: async () => { throw Object.assign(new Error('ausente'), { status: 404 }); }, uploadArtifact: async () => { uploaded++; return { id: 'artifact' }; } };
 assert.deepEqual((await handler({ language: 'es' }, context)).warnings, ['Imagen no disponible']); assert.equal(uploaded, 1);
 await assert.rejects(handler({ language: 'es' }, { ...context, getPlanAsset: async () => { throw Object.assign(new Error('concesión inválida'), { status: 409 }); } }), /concesión/); assert.equal(uploaded, 1);
});

test('conserva figuras HTML del agente sin crear figuras anidadas', async () => {
 const root = await mkdtemp(join(tmpdir(), 'savia-export-agent-image-')); let rendered;
 const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=', 'base64');
 try {
  await exportTechnicalPlan({ projectTitle: 'Proyecto', planAssets: [{ kind: 'agent', reference: 'figuras/plano.png', contentType: 'image/png', bytes }], outline: [{ id: 'a', title: 'Plano', content_mode: 'ai-generate', content: '<p>Texto</p><figure><strong><img data-sv-asset-ref="figuras/plano.png"></strong><figcaption>Plano</figcaption></figure>', children: [] }] }, { tempRoot: root, createHelper: () => ({ createRestrictedHtmlDocx: async (html, _config, options) => { rendered = html; assert.deepEqual(options.assets.get('export-images/0.png'), bytes); return { bytes: Buffer.from('word'), imageWarnings: [] }; }, close: async () => {} }) });
  assert.equal((rendered.match(/<figure/g) || []).length, 1); assert.match(rendered, /<figcaption>Plano<\/figcaption>/);
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('limpia el espacio temporal incluso si falla la conversión o el cierre', async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-export-error-'));
  let closed = false;
  try {
    await assert.rejects(exportTechnicalPlan({ projectTitle: 'Oferta', outline: [{ id: 'one', number: '1', title: 'Capítulo', content_mode: 'manual-fill', content: 'Texto', children: [] }] }, {
      tempRoot: root,
      createHelper: () => ({ createRestrictedHtmlDocx: async () => { throw new Error('fallo de conversión'); }, close: async () => { closed = true; } }),
    }), /fallo de conversión/);
    assert.equal(closed, true);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('elimina los temporales si el helper no cierra', async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-export-close-'));
  try {
    await assert.rejects(exportTechnicalPlan({ projectTitle: 'Oferta', outline: [{ id: 'one', number: '1', title: 'Capítulo', content_mode: 'manual-fill', content: 'Texto', children: [] }] }, {
      tempRoot: root,
      createHelper: () => ({ createRestrictedHtmlDocx: async () => ({ bytes: Buffer.from('result'), imageWarnings: [] }), close: async () => { throw new Error('fallo de cierre'); } }),
    }), /fallo de cierre/);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('proporciona al servicio la ruta explícita del helper preparado', async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-export-helper-'));
  const executablePath = join(root, 'openxmlhelper');
  let selected;
  try {
    await exportTechnicalPlan({ projectTitle: 'Oferta', outline: [{ id: 'one', number: '1', title: 'Capítulo', content_mode: 'manual-fill', content: 'Texto', children: [] }] }, {
      tempRoot: root, executablePath,
      createHelper: options => { selected = options.executablePath; return { createRestrictedHtmlDocx: async () => ({ bytes: Buffer.from('result'), imageWarnings: [] }), close: async () => {} }; },
    });
    assert.equal(selected, executablePath);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('localiza el helper de la plataforma en la distribución', async () => {
  const root = await mkdtemp(join(tmpdir(), 'savia-helper-package-'));
  try {
    const dir = join(root, 'client', 'vendor', 'openxml-tools', 'win32-x64');
    await mkdir(dir, { recursive: true });
    const executable = join(dir, 'openxmlhelper.exe'); await writeFile(executable, 'fixture');
    assert.equal(resolvePackagedHelper(root, 'win32', 'x64'), executable);
    assert.equal(resolvePackagedHelper(root, 'darwin', 'arm64'), undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('la tarea Word descarga el contexto y entrega el archivo con sus avisos', async () => {
  const { createWordExportHandler } = await import('../technical-plan-export.mjs');
  const snapshot = { projectTitle: 'Oferta', outline: [{ id: 'a', title: 'Alcance' }] };
  const received = [];
  const handler = createWordExportHandler({ convert: async (value, options) => { assert.equal(value, snapshot); assert.equal(options.language, 'en'); return { bytes: Buffer.from('documento'), warnings: ['Revisar imagen'] }; } });
  const result = await handler({ language: 'en' }, { signal: new AbortController().signal, getPlanContext: async () => snapshot, uploadArtifact: async bytes => { received.push(Buffer.from(bytes).toString()); return { id: 'artifact-1' }; } });
  assert.deepEqual(received, ['documento']);
  assert.deepEqual(result, { artifactId: 'artifact-1', warnings: ['Revisar imagen'] });
});

test('no entrega el Word si cambian los valores de la plantilla durante la conversión', async () => {
  const { createWordExportHandler } = await import('../technical-plan-export.mjs'); let checks = 0, uploads = 0;
  const handler = createWordExportHandler({ convert: async snapshot => { assert.equal(snapshot.templateValues.f0001, 'Antes'); return { bytes: Buffer.from('documento'), warnings: [] }; } });
  await assert.rejects(handler({ language: 'es' }, { signal: new AbortController().signal, getPlanContext: async () => { if (++checks > 1) throw Object.assign(new Error('conflicto'), { status: 409 }); return { projectTitle: 'Oferta', outline: [{ id: 'a' }], hasTemplate: true, templateValues: { f0001: 'Antes' } }; }, getBidTemplate: async () => Buffer.from('plantilla'), uploadArtifact: async () => { uploads++; } }), /conflicto/);
  assert.equal(uploads, 0);
});

test('aplica el formato capturado por la tarea al generar Word',async()=>{
 let received;
 await exportTechnicalPlan({projectTitle:'Proyecto',exportFormat:{page:{paper_size:'letter',orientation:'landscape'}},outline:[{id:'a',number:'1',title:'Alcance',content_mode:'manual-fill',content:'Texto',children:[]}]},{language:'es',createHelper:()=>({createRestrictedHtmlDocx:async(_html,config)=>{received=config;return {bytes:Buffer.from('word'),imageWarnings:[]};},close:async()=>{}})});
 assert.equal(received.page.paper_size,'letter');assert.equal(received.page.orientation,'landscape');
});
