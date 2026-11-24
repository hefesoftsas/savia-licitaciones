import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeRuntimeText } from './localizeRuntimeText.ts';
import { APP_LOCALES, dictionaries, normalizeLocale, translate } from './dictionaries.ts';
import { bilingualRuntimeMessages } from './bilingualRuntimeMessages.mjs';
import { localizeFindingText } from '../../features/web/blind-check/findingText.mjs';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { pickLocaleMessage } = createRequire(import.meta.url)('../../../electron/utils/localeMessages.cjs');

test('monitor consistency task titles preserve section names in both languages', () => {
  assert.equal(localizeRuntimeText('一致性修复-1.1-Objeto contractual', 'es'), 'Corrección de coherencia-1.1-Objeto contractual');
  assert.equal(localizeRuntimeText('一致性修复-1.1-Objeto contractual', 'en'), 'Consistency repair-1.1-Objeto contractual');
});

test('developer and file-opening errors use the selected language', () => {
  assert.equal(localizeRuntimeText('请先开启开发者模式', 'en'), 'Enable developer mode first.');
  assert.equal(localizeRuntimeText('缺少要打开的文件路径', 'en'), 'The path of the file to open is missing.');
  assert.equal(localizeRuntimeText('请先开启开发者模式', 'es'), 'Activa primero el modo de desarrollador.');
  assert.equal(localizeRuntimeText("Error invoking remote method 'developer:open': Error: 请先开启开发者模式", 'en'), 'Enable developer mode first.');
});

test('knowledge extraction progress is readable in English and preserves counts', () => {
  assert.equal(localizeRuntimeText('AI 正在首次提取知识条目，已完成 2/3 段', 'en'), 'AI is extracting knowledge entries: 2 of 3 sections.');
  assert.equal(localizeRuntimeText('AI 正在补充遗漏知识条目，已完成 4/5 段', 'en'), 'AI is recovering missing knowledge entries: 4 of 5 sections.');
  assert.equal(localizeRuntimeText('User document: AI 正在首次提取知识条目，已完成 2/3 段', 'en'), 'User document: AI 正在首次提取知识条目，已完成 2/3 段');
});

test('English progress preserves counters, section titles, and tool names', () => {
  const examples = [
    ['正文比对 2/3（4/10 句）', 'Text comparison: file 2 of 3, sentence 4 of 10'],
    ['正在分析第 2/3 段资料。', 'Analyzing source section 2 of 3.'],
    ['开始生成 5 个章节正文。', 'Generating content for 5 sections.'],
    ['正在审校：Capítulo 1', 'Reviewing: Capítulo 1'],
    ['正在调用工具：json-validation', 'Using tool: json-validation'],
    ['Agent 正在等待您的回答', 'The agent is waiting for your answer'],
    ['模型请求遇到临时错误，5 秒后进行第 1/3 次重试：HTTP 429', 'Temporary model error; retry 1/3 in 5 s: HTTP 429'],
    ['正文文件已保存：1.2，230 字（2/5）。', 'Content saved: 1.2, 230 words (2/5).'],
  ];
  for (const [source, expected] of examples) assert.equal(localizeRuntimeText(source, 'en'), expected);
  assert.equal(localizeRuntimeText('Document quote: 正在调用工具：json-validation', 'en'), 'Document quote: 正在调用工具：json-validation');
});

test('cancellation and timeout notices use English without altering service details', () => {
  const cases = [
    ['AI 请求队列已暂停', 'The AI request queue is paused.'],
    ['AI 请求已取消', 'The AI request was canceled.'],
    ['Agent 任务已取消', 'The agent task was canceled.'],
    ['AI 请求超时', 'The AI request timed out.'],
    ['Open XML 助手等待完成超时', 'Timed out waiting for the Open XML helper to finish.'],
    ['申请 MinerU-Agent 上传链接失败：HTTP 503，servicio ocupado', 'Failed to request the MinerU-Agent upload URL: HTTP 503，servicio ocupado'],
  ];
  for (const [source, expected] of cases) assert.equal(localizeRuntimeText(source, 'en'), expected);
});

test('SECOP notices written in Spanish also support the English interface', () => {
  const cases = [
    ['Selecciona entre 1 y 20 documentos válidos', 'Select between 1 and 20 valid documents.'],
    ['No se pudieron verificar los documentos', 'The documents could not be verified.'],
    ['No se permiten enlaces en los archivos del proceso.', 'Links are not allowed in the procurement files.'],
    ['No se pudo descargar Pliego.pdf: HTTP 503', 'Could not download Pliego.pdf: HTTP 503'],
  ];
  for (const [source, expected] of cases) {
    assert.equal(localizeRuntimeText(source, 'en'), expected);
    assert.equal(localizeRuntimeText(source, 'es'), source);
  }
});

test('duplicate check progress is readable in Spanish and retains file names and counts', () => {
  assert.equal(localizeRuntimeText('正在提取投标文件元数据', 'es'), 'Extrayendo metadatos de las ofertas');
  assert.equal(localizeRuntimeText('正文比对 2/3（4/10 句）', 'es'), 'Comparación de textos: archivo 2 de 3, frase 4 de 10');
  assert.equal(localizeRuntimeText('archivo.pdf 正文比对失败：error', 'es'), 'archivo.pdf: falló la comparación del texto: error');
  assert.equal(localizeRuntimeText('图片比对 1/3', 'zh'), '图片比对 1/3');
});

test('privacy finding display keeps detected data and translates known placeholders', () => {
  const value = '残留未填写的占位符「【待填写】」';
  assert.equal(localizeFindingText(localizeRuntimeText(value, 'es'), 'es'), 'Hay un marcador sin completar: «[Pendiente por completar]»');
});

test('Spanish dictionary covers every interface key without Chinese text', () => {
  for (const key of Object.keys(dictionaries.es)) {
    assert.ok(Object.hasOwn(dictionaries.es, key), `Missing Spanish key: ${key}`);
    assert.doesNotMatch(dictionaries.es[key], /[\u3400-\u9fff]/u, `Chinese text in Spanish key: ${key}`);
  }
});

test('language selector uses the selected interface language', () => {
  assert.deepEqual(APP_LOCALES.map(item => item.id), ['es', 'en']);
  assert.equal(translate('es', 'common.language'), 'Idioma');
  assert.equal(normalizeLocale(''), 'es');
  assert.equal(normalizeLocale('zh'), 'es');
  assert.equal(normalizeLocale('zh-CN'), 'es');
  assert.equal(normalizeLocale('en-US'), 'en');
});

test('English interface keys and known service errors do not fall back to Chinese', () => {
  for (const key of Object.keys(dictionaries.es)) {
    assert.ok(Object.hasOwn(dictionaries.en, key), `Missing English key: ${key}`);
    assert.doesNotMatch(dictionaries.en[key], /[\u3400-\u9fff]/u, key);
  }
  const [zh, es, en] = bilingualRuntimeMessages.find((entry) => entry[2]);
  assert.equal(localizeRuntimeText(pickLocaleMessage('en', zh, es, en), 'en'), en);
});

test('shows the Spanish part of explicitly bilingual application messages', () => {
  assert.equal(localizeRuntimeText('本地数据库已就绪 (La base de datos local está lista / Local database is ready)', 'es'), 'La base de datos local está lista');
  assert.equal(localizeRuntimeText('原文：文件 (contrato / convenio)', 'es'), '原文：文件 (contrato / convenio)');
  assert.equal(localizeRuntimeText('工具错误: abc', 'es'), '工具错误: abc');
  assert.equal(localizeRuntimeText('SECOP 数据请求失败：HTTP 503 (Error al consultar datos SECOP: HTTP 503 / SECOP data request failed: HTTP 503)', 'es'), 'Error al consultar datos SECOP: HTTP 503');
  assert.equal(localizeRuntimeText('当前技术方案正在执行“目录生成”，请完成后再启动“正文生成”。 (El grupo 技术方案 está ejecutando “目录生成”; complétela antes de iniciar “正文生成”. / Group technical-plan is running a task.)', 'es'), 'El grupo propuesta técnica está ejecutando “generación del catálogo”; complétela antes de iniciar “generación del contenido”.');
  assert.equal(localizeRuntimeText('原文：文件 (contrato / convenio)', 'es'), '原文：文件 (contrato / convenio)');
});

test('shows every known literal backend message in Spanish without changing the backend format', () => {
  assert.ok(bilingualRuntimeMessages.length >= 30);
  for (const [zh, es, en] of bilingualRuntimeMessages) {
    const internal = pickLocaleMessage('es', zh, es, en);
    assert.ok(internal.startsWith(zh));
    assert.equal(localizeRuntimeText(internal, 'es'), es);
  }
});

test('translates known agent progress while keeping variable details', () => {
  assert.equal(localizeRuntimeText('投标文件正文生成', 'es'), 'Redacción de la propuesta');
  assert.equal(localizeRuntimeText('投标文件正文导出修复', 'es'), 'Corrección de la propuesta para exportar');
  assert.equal(localizeRuntimeText('全局事实变量生成', 'es'), 'Preparación de datos generales');
  assert.equal(localizeRuntimeText('全局事实变量生成完成。', 'es'), 'Preparación de datos generales completada.');
  assert.equal(localizeRuntimeText('全局事实变量整理完成：8 个大项。', 'es'), 'Datos generales preparados: 8 grupos.');
  assert.equal(localizeRuntimeText('未选择参考知识库。', 'es'), 'No se seleccionó una base de conocimiento de referencia.');
  assert.equal(localizeRuntimeText('技术方案目录已确认，开始生成子目录', 'es'), 'Catálogo confirmado; se generan los subcapítulos.');
  assert.equal(localizeRuntimeText('修改正文小节：1 Alcance', 'es'), 'Modificación de la sección: 1 Alcance');
  assert.equal(localizeRuntimeText('模型请求已恢复，第 2 次重试成功', 'es'), 'La solicitud al modelo se recuperó en el intento 2');
  assert.equal(localizeRuntimeText('模型请求遇到临时错误，5 秒后进行第 1/3 次重试：HTTP 429', 'es'), 'Error temporal del modelo; reintento 1/3 en 5 s: HTTP 429');
  assert.equal(localizeRuntimeText('Agent 正在等待您的回答', 'es'), 'El agente espera tu respuesta');
  assert.equal(localizeRuntimeText('正在分析第 2/3 段资料。', 'es'), 'Analizando el fragmento 2 de 3.');
  assert.equal(localizeRuntimeText('正在审校：Capítulo 1', 'es'), 'Revisando: Capítulo 1');
  assert.equal(localizeRuntimeText('正文编排结果缺少目标节点：3.1', 'es'), 'El plan de contenido no incluye la sección: 3.1');
  assert.equal(localizeRuntimeText('全局事实第 3 项缺少 id、title 或 content', 'es'), 'El hecho global 3 no contiene id, título o contenido.');
  assert.equal(localizeRuntimeText('非法文件路径：documento.pdf', 'es'), 'Ruta de archivo no válida: documento.pdf');
  assert.equal(localizeRuntimeText('第一轮：正在分析检查范围。', 'es'), 'Primera ronda: analizando el alcance de la revisión.');
  assert.equal(localizeRuntimeText('正在定稿废标项风险第 2/4 批。', 'es'), 'Preparando los riesgos de rechazo del lote 2 de 4.');
  assert.equal(localizeRuntimeText('AI 正在匹配段落 第 2/5 段', 'es'), 'La IA está asociando el fragmento 2 de 5.');
  assert.equal(localizeRuntimeText('整理完成，共 12 条，覆盖率 90%', 'es'), 'Procesamiento completado: 12 entradas, cobertura del 90%.');
  assert.equal(localizeRuntimeText('申请 MinerU-Agent 上传链接失败：HTTP 503，servicio ocupado', 'es'), 'No se pudo solicitar el enlace de carga de MinerU-Agent: HTTP 503，servicio ocupado');
  assert.equal(localizeRuntimeText('图片 lectura.png 的画框比例无效', 'es'), 'La proporción del marco de la imagen lectura.png no es válida.');
  assert.equal(localizeRuntimeText('其他证书[2].images 必须是对象', 'es'), 'certificado[2].images debe ser un objeto');
  assert.equal(localizeRuntimeText('正文文件已保存：1.2，230 字（2/5）。', 'es'), 'Contenido guardado: 1.2, 230 palabras (2/5).');
  assert.equal(localizeRuntimeText('原方案还原完成：已还原 4 个小节，未还原范围 1 处，还原率 80.0%。', 'es'), 'Restauración completada: 4 secciones, 1 fragmento pendiente y 80.0% restaurado.');
  assert.equal(localizeRuntimeText('目录生效字数配置：最少 100 字，最多 不限制 字，每小节建议 300 字。', 'es'), 'Extensión configurada: mínimo 100 palabras, máximo sin límite y sugerencia por sección 300.');
  assert.equal(localizeRuntimeText('字数校正：100 → 200 字（要求 150～不限），改写 2 节', 'es'), 'Ajuste de extensión: 100 → 200 palabras (mínimo 150, máximo sin límite); 2 secciones reescritas');
  assert.equal(localizeRuntimeText('去表格完成，已处理 2 个小节，图片表格保留。', 'es'), 'Retirada de tablas completada en 2 secciones; se conservan las tablas de imágenes.');
  assert.equal(localizeRuntimeText('格式补写：补写 2 处。复查未发现需要补写的明显页栏留白。', 'es'), 'Formato: se completaron 2 espacios. La segunda revisión no encontró espacios evidentes que requieran contenido.');
  assert.equal(localizeRuntimeText('正在调用工具：json-validation', 'es'), 'Usando herramienta: json-validation');
  assert.equal(localizeRuntimeText('技术方案目录生成 V2', 'es'), 'Generación del catálogo técnico V2');
  assert.equal(localizeRuntimeText('项目概述解析失败：Error 429', 'es'), 'Resumen del proyecto: error de análisis: Error 429');
  assert.equal(localizeRuntimeText('按推荐方案处理', 'es'), 'Continuar con la opción recomendada');
  assert.equal(localizeRuntimeText('终止任务', 'es'), 'Detener la tarea');
  assert.equal(localizeRuntimeText('原始招标文件缺失，请重新上传招标文件', 'es'), 'Falta el pliego original. Vuelve a cargarlo.');
  assert.equal(localizeRuntimeText('工具错误: abc', 'es'), '工具错误: abc');
  assert.equal(localizeRuntimeText('Agent 正在等待您的回答', 'zh'), 'Agent 正在等待您的回答');
});

test('translates literal errors from the main tender workflow', () => {
  const names=['globalFactsTaskV2.cjs','outlineGenerationTaskV2.cjs','aiService.cjs','bidAnalysisTask.cjs','globalFactsTask.cjs','fileService.cjs','openXmlHelperService.cjs','contentGenerationConsistencyTools.cjs','contentGenerationEditTools.cjs','originalPlanRestoration.cjs','feasibilityOutlineTask.cjs','blindCheckAgent.cjs','blindCheckImageColor.cjs','blindCheckTask.cjs','technicalPlanExport.cjs','duplicateCheckService.cjs','rejectionCheckTask.cjs'];
  let checked=0;
  for(const name of names){
    const source=readFileSync(new URL(`../../../electron/services/${name}`,import.meta.url),'utf8');
    for(const match of source.matchAll(/new Error\('([^'\n]*[\u3400-\u9fff][^'\n]*)'\)/g)){
      checked++;assert.doesNotMatch(localizeRuntimeText(match[1],'es'),/[\u3400-\u9fff]/u,`${name}: ${match[1]}`);
    }
  }
  assert.ok(checked>=35);
});


test('all literal Chinese errors from application backend modules are covered', () => {
  const root=fileURLToPath(new URL('../../../electron/',import.meta.url));
  let checked=0;
  for(const entry of readdirSync(root,{recursive:true,withFileTypes:true})){
    if(!entry.isFile()||!entry.name.endsWith('.cjs')||entry.name.includes('.test.'))continue;
    const source=readFileSync(join(entry.parentPath,entry.name),'utf8');
    for(const match of source.matchAll(/throw new Error\('([^'\n]*[\u3400-\u9fff][^'\n]*)'\)/g)){
      checked++;
      assert.doesNotMatch(localizeRuntimeText(match[1],'es'),/[\u3400-\u9fff]/u,entry.name+': '+match[1]);
      assert.doesNotMatch(localizeRuntimeText(match[1],'en'),/[\u3400-\u9fff]/u,entry.name+': '+match[1]);
    }
  }
  assert.ok(checked>=100);
});

test('blind-check rule titles and color details translate cleanly to Spanish and English', () => {
  const cases = [
    ['文字颜色', 'Color de texto', 'Text color'],
    ['行距', 'Interlineado', 'Line spacing'],
    ['字号', 'Tamaño de letra', 'Font size'],
    ['当前颜色 #243048', 'Color actual #243048', 'Current color #243048'],
    ['当前颜色 #243048（主题色 accent1）', 'Color actual #243048 (color de tema accent1)', 'Current color #243048 (theme color accent1)'],
    ['主题色 accent1', 'Color de tema accent1', 'Theme color accent1'],
    ['主题色 accent1（#243048）', 'Color de tema accent1 (#243048)', 'Theme color accent1 (#243048)'],
  ];
  for (const [source, expectedEs, expectedEn] of cases) {
    assert.equal(localizeFindingText(source, 'es'), expectedEs);
    assert.equal(localizeFindingText(source, 'en'), expectedEn);
  }
});
