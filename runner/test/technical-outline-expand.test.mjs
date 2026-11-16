import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOutlineExpandHandler } from '../technical-outline-expand.mjs';

test('adapta la selección confirmada a la secuencia de escritorio y conserva su resultado', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-expand-')); let closed = false, args;
  const roots = [{ id: 'eaf26ae4-c1fa-495a-b2c0-b4ab002b32e2', title: 'Técnica', description: 'Alcance', attr: '技术', content_mode: 'ai-generate' }];
  try {
    const handler = createOutlineExpandHandler({ temporaryRoot, createAiService: ({configStore}) => { const config = configStore.load(); assert.equal(config.text_model_provider, 'anthropic-api'); assert.equal(config.base_url, 'https://api.anthropic.com'); assert.equal(config.web_runner_anthropic_native, true); assert.equal(config.reasoning_effort, ''); return {}; }, createRuntime: () => ({ close: async () => { closed = true; } }), runTask: async input => {
      args = input;
      assert.equal(input.payload.agent_resume.phase, 'outline-selection');
      assert.deepEqual((await input.taskControl.waitForOutlineSelection()).items, roots);
      assert.match(input.workspaceStore.loadTechnicalPlan().techRequirements, /Criterio/);
      input.checkpointTask({ status: 'success' }, { outlineData: { outline: roots } });
    } });
    const context = { job: { id: 'job' }, signal: new AbortController().signal, getPlanContext: async () => ({ roots, analyses: { 'project-overview': 'Resumen', 'technical-score': 'Criterio', 'response-requirements': 'Estructura' } }), getCredential: async () => ({ provider:'anthropic-api', model: 'test', secret:'sk-ant-api-fixture' }), askUser: async () => ({ answer: 'Sí' }) };
    const result = await handler({ language: 'es', dataProcessingConsent: true, noTechnicalScore: false }, context);
    assert.equal(result.outline[0].id, roots[0].id); assert.equal(args.taskControl.signal.aborted, false); assert.equal(closed, true);
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('la secuencia real del escritorio genera subcapítulos y ejecuta revisión sin criterios de puntuación', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-expand-flow-'));
  const root = { id: 'eaf26ae4-c1fa-495a-b2c0-b4ab002b32e2', title: 'Técnica', description: 'Alcance', attr: '技术', content_mode: 'ai-generate' };
  try {
    const createRuntime = () => ({ close: async () => {}, async runTask(task) {
      assert.equal(task.initial_stage, 'children_generation');
      const files = Object.fromEntries(task.files.map(file => [file.path, file.content]));
      const candidate = { output_content: JSON.stringify({ outline: [{ id: root.id, title: root.title, description: root.description, attr: root.attr, children: [{ id: null, title: 'Metodología', description: 'Método', content_mode: 'ai-generate' }, { id: null, title: 'Gestión', description: 'Gestión', content_mode: 'ai-generate' }] }] }) };
      let stage = 'children_generation';
      const meta = { get workflow_stage() { return stage; }, readFile: async name => files[name], writeFiles: async values => values.forEach(file => { files[file.path] = file.content; }), user_question_answers: [] };
      let report = await task.validateOutput(candidate, meta); assert.deepEqual(report.issues, []);
      let next = await task.continueTask(candidate, { ...meta, workflow_stage: stage, validation_result: report.value, readFile: meta.readFile, writeFiles: meta.writeFiles }); assert.equal(next.stage, 'outline_review');
      next.files.forEach(file => { files[file.path] = file.content; });
      files['outline-review.json'] = JSON.stringify({ status: 'passed', issues: [], user_feedback: '', summary: 'Revisado' });
      stage = 'outline_review'; const final = { output_content: files['outline.json'] };
      report = await task.validateOutput(final, meta); assert.deepEqual(report.issues, []);
      next = await task.continueTask(final, { ...meta, workflow_stage: stage, validation_result: report.value, readFile: meta.readFile, writeFiles: meta.writeFiles }); assert.equal(next.complete, true);
      return final;
    } });
    const handler = createOutlineExpandHandler({ temporaryRoot, createAiService: () => ({}), createRuntime });
    const result = await handler({ language: 'es', dataProcessingConsent: true, noTechnicalScore: true }, { job: { id: 'job' }, signal: new AbortController().signal, getPlanContext: async () => ({ roots: [root], analyses: { 'project-overview': 'Resumen', 'technical-score': 'No identificado', 'response-requirements': 'Estructura' } }), getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'key' }), askUser: async () => ({ answer: 'Sí' }) });
    assert.equal(result.outline[0].id, root.id); assert.equal(result.outline[0].children.length, 2); assert.ok(result.outline[0].children.every(item => item.id && item.id !== root.id));
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('la secuencia del escritorio conserva el mapeo de puntuación al desarrollar y revisar capítulos', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-expand-score-'));
  const root = { id: 'eaf26ae4-c1fa-495a-b2c0-b4ab002b32e2', title: 'Técnica', description: 'Alcance', attr: '技术', content_mode: 'ai-generate' };
  try {
    const createRuntime = () => ({ close: async () => {}, async runTask(task) {
      assert.equal(task.initial_stage, 'score-planning');
      const files = Object.fromEntries(task.files.map(file => [file.path, file.content]));
      files['technical-score-groups.json'] = JSON.stringify({ groups: [{ requirement_id: 'R1', title: 'Metodología', description: 'Método', detail_points: ['Plan'] }] });
      files['score-directory-plan.json'] = JSON.stringify({ branches: [{ root_id: root.id, root_title: root.title, score_item_level: 2, mappings: [{ requirement_id: 'R1', target_title: 'Metodología' }] }], extra_titles: [], allow_root_changes: false });
      const meta = { workflow_stage: 'score-planning', readFile: async name => files[name], writeFiles: async values => values.forEach(file => { files[file.path] = file.content; }), user_question_answers: [] };
      const step = async candidate => { const report = await task.validateOutput(candidate, meta); assert.deepEqual(report.issues, []); return task.continueTask(candidate, { ...meta, validation_result: report.value }); };
      let next = await step({ output_content: files['outline.json'] }); assert.equal(next.stage, 'children_generation'); next.files.forEach(file => { files[file.path] = file.content; });
      meta.workflow_stage = 'children_generation';
      const full = JSON.stringify({ outline: [{ id: root.id, title: root.title, description: root.description, attr: root.attr, children: [{ id: null, title: 'Metodología', description: 'Método', content_mode: 'ai-generate' }, { id: null, title: 'Gestión', description: 'Gestión', content_mode: 'ai-generate' }] }] });
      next = await step({ output_content: full }); assert.equal(next.stage, 'outline_review'); next.files.forEach(file => { files[file.path] = file.content; });
      files['outline-review.json'] = JSON.stringify({ status: 'passed', issues: [], user_feedback: '', summary: 'Revisado' }); meta.workflow_stage = 'outline_review';
      next = await step({ output_content: files['outline.json'] }); assert.equal(next.complete, true); return { output_content: files['outline.json'] };
    } });
    const handler = createOutlineExpandHandler({ temporaryRoot, createAiService: () => ({}), createRuntime });
    const result = await handler({ language: 'es', dataProcessingConsent: true, noTechnicalScore: false }, { job: { id: 'job' }, signal: new AbortController().signal, getPlanContext: async () => ({ roots: [root], analyses: { 'project-overview': 'Resumen', 'technical-score': 'Criterio: metodología', 'response-requirements': 'Estructura' } }), getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'key' }), askUser: async () => ({ answer: 'Sí' }) });
    assert.equal(result.outline[0].id, root.id); assert.equal(result.outline[0].children[0].title, 'Metodología');
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test('Pi desarrolla y revisa el índice mediante las etapas de escritorio con proveedor simulado', { timeout: 30000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'savia-expand-pi-')); let calls = 0;
  const root = { id: 'eaf26ae4-c1fa-495a-b2c0-b4ab002b32e2', title: 'Técnica', description: 'Alcance', attr: '技术', content_mode: 'ai-generate' };
  try {
    const createAiService = ({ configStore }) => ({ getConfig: () => configStore.load(), getTextQueueStatus: () => ({ active: 0, queued: 0, limit: 1 }), async runAgentChatCompletion(request) {
      calls++; const ctx = { config: configStore.load(), requestBody: { ...request.body, stream: false }, requestId: `expand-${calls}` }; request.onRequestStart?.(ctx);
      const outline = JSON.stringify({ outline: [{ id: root.id, title: root.title, description: root.description, attr: root.attr, children: [{ id: null, title: 'Metodología', description: 'Método', content_mode: 'ai-generate' }, { id: null, title: 'Gestión', description: 'Gestión', content_mode: 'ai-generate' }] }] });
      const review = JSON.stringify({ status: 'passed', issues: [], user_feedback: '', summary: 'Revisado' });
      const write = (path, content) => ({ role: 'assistant', content: null, tool_calls: [{ id: `write-${calls}`, type: 'function', function: { name: 'write', arguments: JSON.stringify({ path, content }) } }] });
      const message = calls === 1 ? write('outline.json', outline) : calls === 3 ? write('outline-review.json', review) : { role: 'assistant', content: 'Etapa terminada.' };
      return request.consumeResponse(new Response(JSON.stringify({ id: `expand-${calls}`, object: 'chat.completion', model: 'fixture', choices: [{ index: 0, message, finish_reason: calls === 1 || calls === 3 ? 'tool_calls' : 'stop' }] }), { headers: { 'content-type': 'application/json' } }), ctx);
    } });
    const handler = createOutlineExpandHandler({ temporaryRoot, createAiService });
    const result = await handler({ language: 'es', dataProcessingConsent: true, noTechnicalScore: true }, { job: { id: 'task-expand' }, signal: new AbortController().signal, getPlanContext: async () => ({ roots: [root], analyses: { 'project-overview': 'Resumen', 'technical-score': 'Sin puntuación', 'response-requirements': 'Estructura' } }), getCredential: async () => ({ provider: 'opencode-go', model: 'test', secret: 'key' }), askUser: async () => { throw new Error('Pregunta inesperada'); } });
    assert.equal(result.outline[0].children.length, 2); assert.ok(calls >= 4);
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});
