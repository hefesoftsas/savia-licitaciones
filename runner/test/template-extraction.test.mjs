import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {pathToFileURL} from 'node:url';
const templateModule=process.env.SAVIA_TEST_PACKAGED_RUNNER?pathToFileURL(join(process.env.SAVIA_TEST_PACKAGED_RUNNER,'runner','template-extraction.mjs')).href:new URL('../template-extraction.mjs',import.meta.url).href;
const {createTemplateExtractionHandler}=await import(templateModule);
import { resolvePackagedHelper, exportTechnicalPlan } from '../technical-plan-export.mjs';
import { fileURLToPath } from 'node:url';
import { fillTemplateValues } from '../template-values.mjs';

test('extrae el Word y el catálogo para los capítulos confirmados, y limpia archivos locales', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-template-')); let closed = 0, uploaded;
  const roots = [{ id: 'eaf26ae4-c1fa-495a-b2c0-b4ab002b32e2', title: 'Formulario', description: 'Oferta', content_mode: 'template-fill' }];
  try {
    const handler = createTemplateExtractionHandler({ temporaryRoot, createAiService: ({configStore}) => { const config = configStore.load(); assert.equal(config.text_model_provider, 'anthropic-api'); assert.equal(config.base_url, 'https://api.anthropic.com'); assert.equal(config.web_runner_anthropic_native, true); assert.equal(config.reasoning_effort, ''); return {}; }, createRuntime: () => ({ close: async () => { closed++; } }), createHelper: () => ({ close: async () => { closed++; } }), runExtraction: async options => {
      assert.deepEqual(options.outline, roots);
      assert.deepEqual(options.workspaceStore.listTenderSourceDocxRelativePaths(), ['sources/source-1.docx']);
      assert.deepEqual(options.workspaceStore.resolveTenderSourceDocxPath('sources/source-1.docx'), ['sources/source-1.docx']);
      assert.deepEqual(options.workspaceStore.resolveTenderSourceDocxPath('../../outside'), []);
      await mkdir(dirname(options.workspaceStore.getBidTemplatePath()), { recursive: true });
      await writeFile(options.workspaceStore.getBidTemplatePath(), Buffer.from('word'));
      await writeFile(options.workspaceStore.getBidTemplateFieldsPath(), JSON.stringify({ version: 1, fields: [{ name: 'Empresa', fill_by: 'manual' }] }));
      return { status: 'success', field_count: 1 };
    } });
    const result = await handler({ language: 'es', dataProcessingConsent: true, fileIds: ['doc'] }, { job: { id: 'task' }, signal: new AbortController().signal, getPlanContext: async () => ({ roots }), getCredential: async () => ({ provider:'anthropic-api', model: 'test', secret:'sk-ant-api-fixture' }), getFileInfo: async () => ({ name: 'pliego.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: Uint8Array.from([0x50, 0x4b, 3, 4]).buffer }), uploadArtifact: async bytes => { uploaded = Buffer.from(bytes).toString(); return { id: 'artifact' }; }, askUser: async () => {} });
    assert.equal(result.artifactId, 'artifact'); assert.equal(result.fields.length, 1); assert.equal(uploaded, 'word'); assert.equal(closed, 2); assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('extrae la plantilla desde un documento recibido por flujo', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-template-')); let closed = 0, uploaded;
  const roots = [{ id: 'eaf26ae4-c1fa-495a-b2c0-b4ab002b32e2', title: 'Formulario', description: 'Oferta', content_mode: 'template-fill' }];
  try {
    const handler = createTemplateExtractionHandler({ temporaryRoot, createAiService: ({configStore}) => { const config = configStore.load(); assert.equal(config.text_model_provider, 'anthropic-api'); assert.equal(config.base_url, 'https://api.anthropic.com'); assert.equal(config.web_runner_anthropic_native, true); assert.equal(config.reasoning_effort, ''); return {}; }, createRuntime: () => ({ close: async () => { closed++; } }), createHelper: () => ({ close: async () => { closed++; } }), runExtraction: async options => {
      assert.deepEqual(options.outline, roots);
      assert.deepEqual(options.workspaceStore.listTenderSourceDocxRelativePaths(), ['sources/source-1.docx']);
      assert.deepEqual(options.workspaceStore.resolveTenderSourceDocxPath('sources/source-1.docx'), ['sources/source-1.docx']);
      assert.deepEqual(options.workspaceStore.resolveTenderSourceDocxPath('../../outside'), []);
      await mkdir(dirname(options.workspaceStore.getBidTemplatePath()), { recursive: true });
      await writeFile(options.workspaceStore.getBidTemplatePath(), Buffer.from('word'));
      await writeFile(options.workspaceStore.getBidTemplateFieldsPath(), JSON.stringify({ version: 1, fields: [{ name: 'Empresa', fill_by: 'manual' }] }));
      return { status: 'success', field_count: 1 };
    } });
    const result = await handler({ language: 'es', dataProcessingConsent: true, fileIds: ['doc'] }, { job: { id: 'task' }, signal: new AbortController().signal, getPlanContext: async () => ({ roots }), getCredential: async () => ({ provider:'anthropic-api', model: 'test', secret:'sk-ant-api-fixture' }), getFileInfo: async () => { throw Error('no usar buffer'); }, getFileStream: async () => ({ name: 'pliego.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: new ReadableStream({start(controller){controller.enqueue(Uint8Array.from([0x50,0x4b,3,4]));controller.close();}}) }), uploadArtifact: async bytes => { uploaded = Buffer.from(bytes).toString(); return { id: 'artifact' }; }, askUser: async () => {} });
    assert.equal(result.artifactId, 'artifact'); assert.equal(result.fields.length, 1); assert.equal(uploaded, 'word'); assert.equal(closed, 2); assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('Pi y el helper OpenXML extraen capítulos y marcan los campos de un DOCX real', { timeout: 60000, skip: !resolvePackagedHelper(fileURLToPath(new URL('../..', import.meta.url))) }, async () => {
  const { createRequire } = await import('node:module'); const require = createRequire(new URL('../../client/package.json', import.meta.url));
  const { Document, Packer, Paragraph, HeadingLevel } = require('docx');
  const bytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ text: 'Formulario', heading: HeadingLevel.HEADING_1 }), new Paragraph('Nombre de la empresa: ____________________')] }] }));
  const root = { id: 'eaf26ae4-c1fa-495a-b2c0-b4ab002b32e2', title: 'Formulario', description: 'Oferta', content_mode: 'template-fill' }; let calls = 0, produced;
  const createAiService = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
    calls++; const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `template-${calls}` }; request.onRequestStart?.(ctx);
    const call = (name, args) => ({ role: 'assistant', content: null, tool_calls: [{ id: `call-${calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
    let message;
    if (calls === 1) message = call('openxml', { action: 'list-blocks' });
    else if (calls === 2) message = call('openxml', { action: 'extract-chapters', chapters: [{ id: root.id, title: root.title, sourceTitle: 'Formulario' }] });
    else if (calls === 3) message = call('openxml', { action: 'scan-template-fields' });
    else if (calls === 4) {
      const contents = request.body.messages.flatMap(item => typeof item.content === 'string' ? [item.content] : []);
      const scan = contents.map(value => { try { return JSON.parse(value); } catch { return null; } }).find(value => value?.action === 'scan-template-fields' && Array.isArray(value.candidates));
      assert.ok(scan, JSON.stringify(contents).slice(-2500));
      const selections = { fields: scan.candidates.map((candidate, index) => ({ candidate_id: candidate.candidate_id, name: `Campo ${index + 1}`, fill_by: 'manual' })), ignored_candidate_ids: [] };
      message = call('write', { path: '投标模版字段分类.json', content: JSON.stringify(selections) });
    } else if (calls === 5) message = call('openxml', { action: 'apply-template-fields', fields_file: '投标模版字段分类.json' });
    else message = { role: 'assistant', content: 'Plantilla lista.' };
    return request.consumeResponse(new Response(JSON.stringify({ id: `template-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls <= 5 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
  } });
  const handler = createTemplateExtractionHandler({ createAiService });
  const result = await handler({ language: 'es', dataProcessingConsent: true, fileIds: ['doc'] }, { job: { id: 'real-template' }, signal: new AbortController().signal, getPlanContext: async () => ({ roots: [root] }), getCredential: async () => ({ provider: 'opencode-go', model: 'fixture', secret: 'key' }), getFileInfo: async () => ({ name: 'pliego.docx', bytes }), uploadArtifact: async output => { produced = Buffer.from(output); return { id: 'artifact' }; }, askUser: async () => {} });
  assert.equal(result.artifactId, 'artifact'); assert.ok(Array.isArray(result.fields)); assert.ok(result.fields.length > 0); assert.ok(produced.length > 100); assert.ok(calls >= 5);
  const filled = fillTemplateValues(produced, { [result.fields[0].id]: 'Peña & Cía' });
  const exported = await exportTechnicalPlan({ projectTitle: 'Oferta', outline: [{ ...root, number: '1', children: [], content: '' }], bidTemplate: filled }, { language: 'es' });
  const AdmZip = require('adm-zip'); const xml = new AdmZip(exported.bytes).readAsText('word/document.xml');
  assert.match(xml, /Nombre de la empresa/); assert.match(require('cheerio').load(xml, { xmlMode: true }).text(), /Peña & Cía/); assert.ok(!exported.warnings.some(value => /plantilla.*no.*incorpor/i.test(value)));
});

test('no usa credenciales con un plan obsoleto ni conserva archivos si la entrada no es DOCX', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-template-invalid-')); let credentials = 0;
  try {
    const handler = createTemplateExtractionHandler({ temporaryRoot, createHelper: () => { throw Error('no debe iniciarse'); } });
    const payload = { language: 'es', dataProcessingConsent: true, fileIds: ['doc'] }, base = { job: { id: 'task' }, signal: new AbortController().signal, getCredential: async () => { credentials++; return { provider: 'opencode-go', model: 'test', secret: 'key' }; }, getFileInfo: async () => ({ name: 'mal.docx', bytes: new TextEncoder().encode('no es zip').buffer }) };
    await assert.rejects(handler(payload, { ...base, getPlanContext: async () => { throw Object.assign(new Error('conflict'), { status: 409 }); } }), /cambiaron/i); assert.equal(credentials, 0);
    await assert.rejects(handler(payload, { ...base, getPlanContext: async () => ({ roots: [{ id: '1' }] }) }), /DOCX/i);
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});
