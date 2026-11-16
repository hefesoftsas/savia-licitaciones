// Show only the name of a file, never the contents, full path, or tool arguments.
function fileName(value) {
  if (typeof value !== 'string') return '';
  const name = value.replace(/[\r\n\t\x00-\x1f]/g, '').split(/[\\/]/).pop().slice(0, 100);
  return ({ '项目概述.md': 'resumen del proyecto', '正文编排决策.json': 'plan de redacción', '正文完整目录.json': 'estructura completa de la propuesta', '正文模板.html': 'plantilla del contenido', '所选模板配置.json': 'configuración de la plantilla', '全局事实设定.md': 'datos generales', '受限HTML生成规范.md': 'reglas de formato', '配图类型对照表.md': 'guía de ilustraciones', '招标文件.md': 'pliego de la licitación', '格式要求.json': 'requisitos de formato', '程序检查结果.json': 'resultado de la revisión', '待处理问题.json': 'problemas pendientes', '修复后检查结果.json': 'resultado de la revisión tras la corrección', '复查结果.json': 'resultado de la segunda revisión', '复核结果.json': 'resultado de la revisión', '处理结果.json': 'resultado del procesamiento', '正文一致性事实台账.json': 'registro de coherencia', '正文一致性事实台账.md': 'registro de coherencia', '招标文件关键信息.md': 'información clave del pliego', '一致性修复结果.json': 'resultado de las correcciones de coherencia', '正文生成结果.json': 'resultado de la redacción', '索引.json': 'índice', '正文图片清单.json': 'lista de imágenes de la propuesta', '正文字数统计.json': 'recuento de palabras', '提交校验问题.json': 'problemas de validación', '正文编排目录.json': 'catálogo de redacción', '正文编排结果.json': 'resultado de organización del contenido', '参考知识库轻量条目.json': 'referencias de la base de conocimiento', '正文编排目标.json': 'objetivos de redacción', '正文生成.json': 'tarea de redacción', '配图生成.json': 'tarea de generación de imágenes', '转图.json': 'tarea de conversión de imagen', '图片回填.json': 'tarea de inserción de imágenes', '一致性修复.json': 'tarea de corrección de coherencia', '格式自检.docx': 'comprobación de formato Word' })[name] || name;
}
function describeToolActivity(tool, args = {}, phase, details = {}) {
  const file = fileName(args.path || args.file || args.file_path);
  const suffix = file ? ` ${file}` : '';
  if (phase === 'update' && tool === 'generate-sections' && details.status === 'success') {
    const section = typeof details.title === 'string' ? details.title.replace(/[\r\n\t\x00-\x1f]/g, ' ').slice(0, 120) : fileName(details.file);
    return section ? `Sección ${section} redactada y guardada` : 'Una sección fue redactada y guardada';
  }
  if (phase === 'update') return '';
  if (tool === 'json-validation' && phase !== 'start' && typeof details.valid === 'boolean') {
    const subject = file ? `Archivo ${file}` : 'Archivo';
    if (details.valid) return `${subject}: estructura validada`;
    const count = Array.isArray(details.errors) ? details.errors.length : 0;
    return `${subject}: la validación encontró ${count} ${count === 1 ? 'error' : 'errores'}`;
  }
  if (phase === 'end' && tool === 'search-sections' && Number.isFinite(details.total)) return `Búsqueda terminada: ${details.total} ${details.total === 1 ? 'coincidencia' : 'coincidencias'}`;
  if (phase === 'end' && ['recheck-sections', 'repair-sections', 'generate-sections'].includes(tool) && Number.isFinite(details.total) && Number.isFinite(details.success)) {
    const pending = Array.isArray(details.unresolved) ? details.unresolved.length : 0;
    const label = tool === 'generate-sections' ? 'Redacción' : tool === 'repair-sections' ? 'Corrección' : 'Revisión';
    return `${label} terminada: ${details.success} de ${details.total} secciones correctas${pending ? `; ${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}` : ''}`;
  }
  if (phase === 'end' && tool === 'check-word-count' && Number.isFinite(details.total_words)) return `Recuento estimado: ${details.total_words} unidades de texto`;
  if (tool === 'openxml') {
    const actions = { 'scan-template-fields': 'Identificando campos de la plantilla Word', 'list-blocks': 'Revisando la estructura del documento Word', 'extract-chapters': 'Extrayendo capítulos del documento Word', 'apply-template-fields': 'Preparando los campos de la plantilla Word' };
    if (actions[args.action]) return phase === 'start' ? actions[args.action] : phase === 'error' ? 'Falló la operación con el documento Word' : 'Operación con el documento Word terminada';
  }
  const names = {
    read: [`Leyendo el archivo${suffix}`, `Archivo${suffix} leído`, 'Falló la lectura del archivo'],
    write: [`Guardando el archivo${suffix}`, `Archivo${suffix} guardado`, 'Falló la escritura del archivo'],
    edit: [`Editando el archivo${suffix}`, `Archivo${suffix} editado`, 'Falló la edición del archivo'],
    ls: ['Consultando los archivos disponibles', 'Archivos disponibles consultados', 'Falló la consulta de archivos'],
    find: ['Buscando archivos relevantes', 'Búsqueda de archivos terminada', 'Falló la búsqueda de archivos'],
    grep: ['Buscando información en los documentos', 'Búsqueda en documentos terminada', 'Falló la búsqueda en documentos'],
    'json-validation': ['Validando la estructura de los datos', 'Estructura de datos validada', 'Falló la validación de datos'],
    'generate-sections': ['Redactando las secciones de la propuesta', 'Redacción de secciones terminada', 'Falló la redacción de secciones'],
    'search-sections': ['Buscando información en las secciones de la propuesta', 'Búsqueda en las secciones terminada', 'Falló la búsqueda en las secciones'],
    'recheck-sections': ['Revisando las secciones pendientes', 'Revisión de secciones terminada', 'Falló la revisión de secciones'],
    'repair-sections': ['Corrigiendo inconsistencias entre secciones', 'Corrección de secciones terminada', 'Falló la corrección de secciones'],
    'complete-consistency-round': ['Comprobando la coherencia de la propuesta', 'Revisión de coherencia terminada', 'Falló la revisión de coherencia'],
    'check-word-count': ['Contando las palabras de la propuesta', 'Recuento de palabras terminado', 'Falló el recuento de palabras'],
    'list-section-images': ['Revisando las imágenes de las secciones', 'Lista de imágenes revisada', 'Falló la revisión de imágenes'],
    'generate-section-images': ['Generando imágenes para la propuesta', 'Generación de imágenes terminada', 'Falló la generación de imágenes'],
    'apply-section-images': ['Añadiendo imágenes a las secciones', 'Imágenes incorporadas a las secciones', 'No se pudieron incorporar las imágenes'],
    'openxml': ['Trabajando con el documento Word', 'Operación con el documento Word terminada', 'Falló la operación con el documento Word'],
    'report-failure': ['Informando un problema que impide continuar', 'Problema informado', 'No se pudo informar el problema'],
    'ask-user': ['Preparando una pregunta para tu revisión', 'Pregunta procesada', 'Falló la solicitud de revisión'],
  };
  const labels = names[tool];
  if (!labels) return phase === 'update' ? '' : `Herramienta ${String(tool || '').replace(/[^\w-]/g, '').slice(0, 60)}: ${phase === 'start' ? 'en ejecución' : phase === 'error' ? 'falló' : 'terminó'}`;
  return labels[phase === 'start' ? 0 : phase === 'error' ? 2 : 1];
}
module.exports = { describeToolActivity };
