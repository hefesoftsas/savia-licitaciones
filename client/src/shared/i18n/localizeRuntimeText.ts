import { bilingualRuntimeMessages } from './bilingualRuntimeMessages.mjs';
import { localizeBlindCheckProgress } from './blindCheckProgress.mjs';
import { englishRuntimeErrors } from './englishRuntimeErrors.mjs';
import { localizeEnglishProgress } from './englishRuntimeProgress.mjs';

const bilingualSpanish = new Map<string, string>();
const bilingualEnglish = new Map<string, string>();
// These disabled-service notices predate the shared bilingual error protocol.
const offlineMessages: Array<[string, string, string]> = [
  ['官方账户服务已离线禁用（无网络） / Servicio de cuenta oficial sin conexión (offline) / Official account service offline (no network)', 'Servicio de cuenta oficial sin conexión.', 'The official account service is offline.'],
  ['在线授权刷新已禁用（无网络） / Activación en línea deshabilitada: sin red (offline) / Online license activation disabled (offline, no network)', 'La activación de licencias en línea está deshabilitada.', 'Online license activation is disabled.'],
  ['插件市场已离线禁用（无网络） / Mercado de plugins deshabilitado (offline, sin red) / Plugin market disabled (offline, no network)', 'El mercado de complementos está deshabilitado.', 'The plugin marketplace is disabled.'],
  ['Actualización en línea deshabilitada (offline) / 在线更新已禁用 / Online updates disabled (offline, network disconnected)', 'Las actualizaciones en línea están deshabilitadas.', 'Online updates are disabled.'],
];
for (const [source, es, en] of offlineMessages) {
  bilingualSpanish.set(source, es);
  bilingualEnglish.set(source, en);
}
for (const [source, translation] of englishRuntimeErrors) bilingualEnglish.set(source, translation);
bilingualEnglish.set('Pi Agent 空闲', 'Agent idle');
bilingualEnglish.set('请先开启开发者模式', 'Enable developer mode first.');
bilingualEnglish.set('缺少要打开的文件路径', 'The path of the file to open is missing.');
bilingualEnglish.set('打开设置', 'Open settings');
for (const [source, translated] of [
  ['技术方案一级目录生成', 'Initial technical outline generation'],
  ['技术方案目录生成 V2', 'Technical outline generation V2'],
  ['投标模版提取', 'Bid template extraction'],
  ['投标文件正文生成', 'Bid content generation'],
  ['投标文件正文导出修复', 'Bid content export repair'],
  ['暗标 AI 复核', 'Anonymous bid AI review'],
  ['暗标 AI 修复', 'Anonymous bid AI repair'],
  ['原方案正文还原 Agent', 'Original proposal content restoration'],
  ['一致性修复', 'Consistency repair'],
  ['提交问题修复', 'Submission issue repair'],
] as const) bilingualEnglish.set(source, translated);
for (const [zh, es, en] of bilingualRuntimeMessages) {
  if (en) {
    bilingualEnglish.set(zh, en);
    bilingualEnglish.set(`${zh} (${en})`, en);
    bilingualEnglish.set(`${zh} (${es} / ${en})`, en);
    bilingualEnglish.set(`${zh} (${en} / ${es})`, en);
  }
  bilingualSpanish.set(`${zh} (${es})`, es);
  if (en && en !== es) {
    bilingualSpanish.set(`${zh} (${es} / ${en})`, es);
    bilingualSpanish.set(`${zh} (${en} / ${es})`, es);
  }
}

// Dynamic bilingual errors retain the original text internally for existing parsers.
// Match only known application prefixes so unrelated source text is never rewritten.
const dynamicBilingual: Array<[RegExp, string]> = [
  [/^工作区数据库初始化失败：/, 'Error al inicializar la base de datos del espacio de trabajo:'],
  [/^本地数据库初始化失败：/, 'Error al inicializar la base de datos local:'],
  [/^图片下载失败：/, 'Error al descargar la imagen:'],
  [/^MinerU-Agent 解析失败：/, 'Error de análisis de MinerU-Agent:'],
  [/^MinerU-Agent 轮询超时/, 'Tiempo de espera de MinerU-Agent agotado;'],
  [/^SECOP 数据请求失败：HTTP /, 'Error al consultar datos SECOP: HTTP'],
  [/^当前.+正在执行/, 'El grupo '],
  [/^.+：未提取到有效文字，请检查文件内容$/, ''],
];

function extractKnownDynamicSpanish(text: string): string | null {
  if (!text.endsWith(')')) return null;
  const separator = text.lastIndexOf(' / ');
  if (separator < 0) return null;
  for (const [prefix, spanishStart] of dynamicBilingual) {
    let open = spanishStart ? text.lastIndexOf(` (${spanishStart}`, separator) : text.lastIndexOf(' (', separator);
    if (open < 0 || !prefix.test(text.slice(0, open))) continue;
    const spanish = text.slice(open + 2, separator).trim();
    if (!spanish || (spanishStart && !spanish.startsWith(spanishStart))) continue;
    return spanish;
  }
  return null;
}

const SPANISH: Array<[string, string]> = [
  ['打开设置', 'Abrir ajustes'],
  ["请先开启开发者模式","Activa primero el modo de desarrollador."],
  ["缺少要打开的文件路径","Falta la ruta del archivo que se quiere abrir."],
  ["AI 请求队列已暂停","La cola de solicitudes de IA está en pausa."],
  ["AI 请求已取消","Se canceló la solicitud a la IA."],
  ["AI 源码不能为空","El código generado por la IA no puede estar vacío."],
  ["AI 源码须为纯源码或唯一完整代码块，不能包含多个代码块或未闭合围栏","El código debe ser texto plano o un único bloque completo, sin bloques múltiples ni delimitadores abiertos."],
  ["远程转图任务已停止","Se detuvo la conversión remota a imagen."],
  ["日志内容无法序列化","No se pudo preparar el contenido del registro."],
  ["；仍未达标，保留字数偏差。","; aún no alcanza la extensión solicitada."],
  ["复查未发现需要补写的明显页栏留白。","La segunda revisión no encontró espacios evidentes que requieran contenido."],
  ["格式自检完成，未发现本次目标小节中需要补写的明显页栏留白。","Revisión de formato completada; no se detectaron espacios evidentes que requieran contenido en las secciones seleccionadas."],
  ["格式自检补写后仍有 ","Después de completar el formato quedan "],
  [" 处明显留白，本轮不再补写："," espacios evidentes que no se completarán en esta pasada: "],
  ["未定位","sin ubicación"],
  ["继续导出修复，沿用原正文 Agent 会话。","Continúa la corrección de exportación con la sesión original del agente."],
  ["开始导出修复，问题已交给原正文 Agent 会话。","Iniciando la corrección de exportación con la sesión original del agente."],
  ["导出修复已结束，请重新点击导出。","Corrección de exportación terminada; vuelve a pulsar Exportar."],
  ["导出修复已暂停，继续时沿用原正文会话。","La corrección de exportación está en pausa; se retomará con la sesión original."],
  ["全文一致性审计为必做阶段，正文扩写完成后将使用 Agent 检查并修复事实冲突。","La revisión de coherencia es obligatoria; el agente comprobará y corregirá posibles contradicciones al terminar la redacción."],
  ["检测到已上传原方案：已读取完整原方案，交由 Agent 按语义还原。","Se leyó la propuesta original cargada; el agente la restaurará según su contenido."],
  ["开始批量转换 Word，每个小节生成一个文件。","Iniciando la conversión a Word; se creará un archivo por sección."],
  ["Agent 实时进度：","Avance del agente: "],
  ["输出目录：","Carpeta de salida: "],
  ["正文有效性检查失败：","Falló la validación del contenido: "],
  ["未命名章节","capítulo sin nombre"],
  ["所选文件夹缺少 ","Falta en la carpeta seleccionada: "],
  ["存在未知根字段：","Hay un campo raíz desconocido: "],
  [" 包含未知图片栏目："," contiene una categoría de imagen desconocida: "],
  [" 包含未知字段："," contiene un campo desconocido: "],
  [" 必须是相对路径或图片对象"," debe ser una ruta relativa o un objeto de imagen"],
  [" 必须填写文件夹内的相对路径"," debe contener una ruta relativa dentro de la carpeta"],
  [" 不能指向所选文件夹之外"," no puede apuntar fuera de la carpeta seleccionada"],
  [" 不是支持的图片格式"," no tiene un formato de imagen compatible"],
  [" 对应图片不存在"," apunta a una imagen que no existe"],
  [" 必须是对象"," debe ser un objeto"],
  [" 必须是数组"," debe ser una lista"],
  ["不支持的图片格式：","Formato de imagen no compatible: "],
  ["标题行无效、重复或位于表格中：","La línea de título no es válida, está repetida o está dentro de una tabla: "],
  ["原文行范围无效：","El rango de líneas del documento original no es válido: "],
  ["还原小节 ID 无效或重复：","El identificador de la sección restaurada no es válido o está repetido: "],
  [" 缺少 source_ranges"," no tiene source_ranges"],
  [" 的原文范围须按原文顺序排列"," debe mantener los rangos en el orden del documento original"],
  ["Agent 服务正在关闭","El servicio del agente se está cerrando"],
  ["AI 请求超时","Se agotó el tiempo de espera de la solicitud a la IA"],
  ["AI 返回内容为空，无法解析 JSON","La IA devolvió una respuesta vacía; no se puede procesar como JSON"],
  ["正文编排结果格式错误：","El plan de contenido tiene un formato incorrecto: "],
  ["小节修改已暂停","La edición de la sección está en pausa"],
  ["正文生成已取消","Se canceló la generación del contenido"],
  ["自然化审校已取消","Se canceló la revisión de redacción"],
  ["加载渲染页面超时","Se agotó el tiempo de espera al cargar la vista"],
  ["转图已暂停","La conversión a imagen está en pausa"],
  ["暂时无法连接官方账户服务，请稍后重试","No se puede conectar con el servicio de cuenta oficial; inténtalo más tarde"],
  ["官方账户响应读取失败，请稍后重试","No se pudo leer la respuesta del servicio de cuenta oficial; inténtalo más tarde"],
  ["Open XML 任务已取消","Se canceló la tarea de Open XML"],
  ["Open XML 助手已退出","El asistente de Open XML terminó"],
  ["Open XML 助手等待完成超时","Se agotó el tiempo de espera del asistente de Open XML"],
  ["Open XML 助手已关闭","El asistente de Open XML está cerrado"],
  ["插件市场响应格式错误","La respuesta del catálogo de complementos tiene un formato incorrecto"],
  ["目录生成任务已取消","Se canceló la generación del catálogo"],
  ["目录生成任务已结束","La generación del catálogo ya terminó"],
  ["后台任务已取消","Se canceló la tarea en segundo plano"],
  ["投标模版正在被 Word 使用，请关闭后重试","La plantilla de oferta está abierta en Word; ciérrala e inténtalo de nuevo"],
  ["无法清理招标 Word 原件，请关闭可能占用原件的 Word/WPS，并确认文件可写后重试","No se pudo limpiar el Word original; cierra Word o WPS y comprueba que el archivo se pueda modificar"],
  ["请求超时","Se agotó el tiempo de espera de la solicitud"],
  ["更新包下载地址无效","La dirección de descarga de la actualización no es válida"],
  ["更新包下载重定向次数过多","La descarga de la actualización tuvo demasiadas redirecciones"],
  ["下载更新包超时","Se agotó el tiempo de espera para descargar la actualización"],
  ["本地 Proxy 回连超时","Se agotó el tiempo de conexión con el intermediario local"],
  ["请求体过大","El contenido de la solicitud es demasiado grande"],
  ["AI 流式响应长时间无数据","La respuesta de la IA no recibió datos durante demasiado tiempo"],
  ["请求已取消","Se canceló la solicitud"],
  ["AI 流式响应缺少可读取的响应体","La respuesta de la IA no tiene contenido legible"],
  ["客户端请求已中止","Se interrumpió la solicitud de la aplicación"],
  ["客户端连接已关闭","Se cerró la conexión de la aplicación"],
  ["Agent 任务已取消","Se canceló la tarea del agente"],
  ["TCP 连接超时","Se agotó el tiempo de conexión TCP"],
  ["本地 HTTP 请求超时","Se agotó el tiempo de la solicitud HTTP local"],
  ["AI 流式响应解析失败","No se pudo procesar la respuesta de la IA"],
  ["AI 流式请求失败","Falló la solicitud de respuesta de la IA"],
  ["AI 流式响应不可读","La respuesta de la IA no se puede leer"],
  ["AI 请求失败","Falló la solicitud a la IA"],
  ["申请 MinerU-Agent 上传链接失败：HTTP ","No se pudo solicitar el enlace de carga de MinerU-Agent: HTTP "],
  ["MinerU-Agent 响应缺少 task_id/file_url：","La respuesta de MinerU-Agent no contiene task_id o file_url: "],
  ["查询 MinerU-Agent 任务失败：HTTP ","No se pudo consultar la tarea de MinerU-Agent: HTTP "],
  ["申请 MinerU 精准解析上传链接失败：HTTP ","No se pudo solicitar el enlace de carga de MinerU: HTTP "],
  ["MinerU 精准解析响应缺少 batch_id/file_url：","La respuesta de MinerU no contiene batch_id o file_url: "],
  ["查询 MinerU 精准解析任务失败：HTTP ","No se pudo consultar la tarea de MinerU: HTTP "],
  ["MinerU 精准解析失败：","Falló el análisis de MinerU: "],
  ["MinerU 精准解析轮询超时，请稍后重试，batch_id: ","Se agotó la espera de MinerU; inténtalo más tarde. batch_id: "],
  ["文件上传失败：HTTP ","Falló la carga del archivo: HTTP "],
  ["下载 MinerU 精准解析结果失败：HTTP ","No se pudo descargar el resultado de MinerU: HTTP "],
  ["未知错误","error desconocido"],
  ["这些章节缺少原文定位：","No se encontró la ubicación original de estos capítulos: "],
  ["未知动作：","Acción desconocida: "],
  ["多份 Word 原件时章节必须填写 source：","Cuando hay varios documentos Word, el capítulo debe indicar source: "],
  ["无法唯一确定章节原件：","No se pudo identificar un único documento original para el capítulo: "],
  ["图片尚未生成或未填写 data-sv-asset-ref：","La imagen no se ha generado o no tiene data-sv-asset-ref: "],
  ["未命名图片","imagen sin nombre"],
  ["正文引用的图片文件不存在：","No existe el archivo de imagen al que hace referencia el contenido: "],
  ["无法定位图片原始标签：","No se encontró la etiqueta original de la imagen: "],
  ["无法定位图片标签结尾：","No se encontró el final de la etiqueta de la imagen: "],
  ["图片标识不存在：","No existe el identificador de imagen: "],
  ["图片文件不存在：","El archivo de imagen no existe: "],
  ["图片引用已变化，请刷新清单：","La referencia de la imagen cambió; actualiza la lista: "],
  ["不能读取非目标小节：","No se puede leer una sección que no fue seleccionada: "],
  ["正在复制原始文件","Copiando el archivo original"],
  ["正在转换为 Markdown","Convirtiendo el archivo a Markdown"],
  ["AI 正在首次提取知识条目","La IA está extrayendo entradas de conocimiento"],
  ["AI 正在补充遗漏知识条目","La IA está recuperando entradas de conocimiento omitidas"],
  ["开始匹配段落","Iniciando la asociación de párrafos"],
  ["AI 正在匹配段落","La IA está asociando párrafos"],
  ["正在回填正文并保存知识条目","Guardando las entradas y asociándolas al contenido"],
  ["等待处理","Pendiente de procesamiento"],
  ["文件夹排序已保存","Orden de carpetas guardado"],
  ["已取消选择","Selección cancelada"],
  ["该文档正在处理中","El documento se está procesando"],
  ["只有解析失败的文档可以重试","Solo se pueden reintentar documentos cuyo análisis haya fallado"],
  ["原始文件不存在，请重新上传","El archivo original no existe; vuelve a cargarlo"],
  ["已重新开始解析","Se reinició el análisis"],
  ["该文档正在匹配中","El documento está en proceso de asociación"],
  ["请等待候选知识条目提取完成","Espera a que se extraigan las entradas de conocimiento"],
  ["已开始自动分段匹配段落","Se inició la asociación automática de párrafos"],
  ["处理失败","Falló el procesamiento"],
  ["匹配失败","Falló la asociación"],
  ["第一轮：正在分析检查范围。","Primera ronda: analizando el alcance de la revisión."],
  ["第二轮：正在逐项检查投标文件。","Segunda ronda: revisando la oferta punto por punto."],
  ["第三轮：正在补充、去重并生成结果。","Tercera ronda: completando, eliminando duplicados y generando resultados."],
  ["正在识别错别字候选。","Buscando posibles errores de escritura."],
  ["正在检查逻辑谬误。","Revisando posibles errores de lógica."],
  ["正在启动检查任务。","Iniciando la revisión."],
  ["正在按上下文长度滚动审阅投标包。","Revisando la oferta por fragmentos."],
  ["正在基于全投标包状态定稿废标项风险。","Preparando los riesgos de rechazo a partir de toda la oferta."],
  ["正在全局合并废标项风险。","Consolidando los riesgos de rechazo."],
  ["正在按上下文长度分段识别错别字。","Buscando errores de escritura por fragmentos."],
  ["正在合并并校验错别字原文位置。","Consolidando y verificando la ubicación de los posibles errores."],
  ["正在按上下文长度滚动检查投标包逻辑谬误。","Revisando la lógica de la oferta por fragmentos."],
  ["正在基于全投标包状态定稿逻辑问题。","Preparando los problemas de lógica a partir de toda la oferta."],
  ["正在全局合并逻辑问题。","Consolidando los problemas de lógica."],
  ["正在校验错别字原文位置。","Verificando la ubicación de los posibles errores de escritura."],
  ["错别字检查","Revisión de escritura"],
  ["逻辑谬误检查","Revisión de lógica"],
  ["开始检查投标文件。","Iniciando la revisión de la oferta."],
  ["检查完成。","Revisión completada."],
  ["开始解析无效与废标项。","Analizando las causales de rechazo."],
  ["无效与废标项解析完成。","Análisis de causales de rechazo completado."],
  ["无效与废标项解析失败：","Falló el análisis de causales de rechazo: "],
  ["模型未返回解析内容。","El modelo no devolvió contenido para el análisis."],
  ["请先在“长嘛样”选择有效的正文模板","Selecciona primero una plantilla válida para el contenido."],
  ["必须输出带 savia:block 分隔的有效受限 HTML 正文，不得输出 Markdown 或代码围栏","El contenido debe ser HTML válido con separadores savia:block, sin Markdown ni bloques de código."],
  ["原正文 Agent 会话不存在，无法执行导出修复","No existe la sesión del agente para corregir la exportación."],
  ["基础编排尚未完成，请先提交编排结果","La organización inicial no está terminada; envía primero el resultado."],
  ["一致性审计结论已经提交，请标记任务完成并等待程序进入下一阶段","La revisión de coherencia ya se envió; marca la tarea como terminada y espera la siguiente etapa."],
  ["图片或源码路径必须是当前工作区内使用正斜杠的相对路径","La ruta de imagen o código debe ser relativa al espacio de trabajo y usar barras diagonales."],
  ["HTML 配图必须提供合法的 frame_size：square、wide、tall 或 panorama","La imagen HTML debe indicar un tamaño válido: square, wide, tall o panorama."],
  ["图片不属于本次目标小节，请使用清单中的 image_id","La imagen no pertenece a la sección seleccionada; usa un image_id de la lista."],
  ["回填必须使用图片资源，不能使用绘图源码","Para insertar la imagen usa el recurso de imagen y no el código fuente."],
  ["原方案图片不重新生成，请修复原图引用","Las imágenes de la propuesta original no se regeneran; corrige sus referencias."],
  ["该图片只能复用，不能重新生成","Esta imagen solo puede reutilizarse, no regenerarse."],
  ["同一任务文件中图片的 image_id 不能重复","Los identificadores de imagen no pueden repetirse en el mismo archivo de tarea."],
  ["同一任务文件中回填的 image_id 不能重复","Los identificadores de imágenes insertadas no pueden repetirse en el mismo archivo de tarea."],
  ["未找到对应的图片块","No se encontró el bloque de imagen correspondiente."],
  ["没有输出文字","No se generó texto."],
  ["只输出一段纯文本，不使用 HTML 标签","Genera un solo párrafo de texto sin etiquetas HTML."],
  ["图片块在补写期间已变化，未写回","El bloque de imagen cambió durante la edición; no se guardó el resultado."],
  ["当前不在格式补写阶段","La tarea no está en la etapa de completar el formato."],
  ["没有输出段落或列表","No se generaron párrafos ni listas."],
  ["顶层只能使用 p、ul 或 ol","En el nivel superior solo se permiten p, ul u ol."],
  ["转换结果不能包含表格或图片","El resultado de la conversión no puede contener tablas ni imágenes."],
  ["段落和列表之外不能有文字","No puede haber texto fuera de los párrafos y listas."],
  ["原表格在转换期间已变化，未写回","La tabla original cambió durante la conversión; no se guardó el resultado."],
  ["当前不在去表格阶段","La tarea no está en la etapa de retirar tablas."],
  ["图片或表格与原文不一致，请原样保留全部占位注释","Las imágenes o tablas no coinciden con el original; conserva todas las referencias originales."],
  ["仍有生成或编辑任务运行，请等待全部结束再检查字数","Espera a que terminen las tareas de generación y edición antes de comprobar la extensión."],
  ["当前不在字数校正阶段","La tarea no está en la etapa de ajuste de extensión."],
  ["未找到要修改的 AI 正文小节","No se encontró la sección generada con IA que se quería modificar."],
  ["原正文 Agent 会话不存在，无法修改小节","No existe la sesión original del agente; no se puede modificar la sección."],
  ["正式替换逻辑测试需要传入当前章节正文和待替换目标块","La prueba de reemplazo necesita el texto del capítulo y el bloque que se va a reemplazar."],
  ["Mermaid code 为空","El código Mermaid está vacío."],
  ["只支持 flowchart TD/TB/LR/RL/BT","Solo se admiten diagramas flowchart con dirección TD, TB, LR, RL o BT."],
  ["Mermaid 本地转图失败","No se pudo convertir el diagrama Mermaid en imagen."],
  ["模型未返回可渲染的 HTML","El modelo no devolvió HTML que se pueda mostrar."],
  ["HTML 本地转图失败","No se pudo convertir el HTML en imagen."],
  ["生图模型未返回本地图片地址","El modelo de imágenes no devolvió una ruta de imagen local."],
  ["配图提示词为空","Falta la descripción de la imagen."],
  ["未找到 mermaid 浏览器脚本，无法本地渲染 Mermaid","No se encontró el componente necesario para mostrar el diagrama Mermaid."],
  ["页面截图失败：未返回图像数据","Falló la captura de la página: no se recibieron datos de imagen."],
  ["拼接截图失败","No se pudieron combinar las capturas."],
  ["等待页面布局稳定超时","Se agotó el tiempo de espera para estabilizar la página."],
  ["Mermaid 渲染超时","Se agotó el tiempo de espera para mostrar el diagrama Mermaid."],
  ["官方账户服务已关闭","El servicio de cuenta oficial está desactivado."],
  ["请先登陆官方账户","Inicia sesión primero en la cuenta oficial."],
  ["API Key 列表格式不正确","La lista de claves de API tiene un formato incorrecto."],
  ["接口未返回完整 API Key","El servicio no devolvió una clave de API completa."],
  ["官方账户接口未返回有效令牌","El servicio de cuenta oficial no devolvió una credencial válida."],
  ["官方账户接口未返回有效的邮箱登录令牌","El servicio de cuenta oficial no devolvió una credencial válida de inicio de sesión por correo."],
  ["邮箱登录令牌已过期，请重新登录","La credencial de inicio de sesión por correo venció; vuelve a iniciar sesión."],
  ["官方流水接口返回的分页数据不完整，请重试","El servicio devolvió una página incompleta; inténtalo de nuevo."],
  ["插件没有配置界面","El complemento no tiene una pantalla de configuración."],
  ["配置界面文件不存在","No se encuentra el archivo de la pantalla de configuración."],
  ["Agent 问答服务不可用","El servicio de preguntas del agente no está disponible."],
  ["Agent 工作空间服务不可用","El espacio de trabajo del agente no está disponible."],
  ["任务服务不可用","El servicio de tareas no está disponible."],
  ["工具参数根节点不是对象","Los parámetros de la herramienta deben ser un objeto."],
  ["file_path 必须是当前工作区内的非空相对路径","file_path debe ser una ruta relativa no vacía dentro del espacio de trabajo."],
  ["路径必须是当前工作区内的相对路径","La ruta debe ser relativa al espacio de trabajo actual."],
  ["Open XML 助手尚未初始化","El asistente de Open XML aún no está listo."],
  ["请重新导入招标文件","Vuelve a importar el pliego."],
  ["助手没有写出原文结构","El asistente no produjo la estructura del documento original."],
  ["extract-chapters 需要 chapters","extract-chapters necesita capítulos."],
  ["请先调用 extract-chapters 抽取投标模版章节","Extrae primero los capítulos de la plantilla de oferta."],
  ["必须抽取全部已确认的模板填写章节，请检查已确认一级目录","Se deben extraer todos los capítulos confirmados para completar con plantilla; revisa el catálogo de primer nivel confirmado."],
  ["助手没有写出投标模版字段候选","El asistente no produjo los campos propuestos de la plantilla de oferta."],
  ["fields_file 必须位于当前工作区内","fields_file debe estar dentro del espacio de trabajo actual."],
  ["助手没有同时写出投标模版和字段清单","El asistente no produjo tanto la plantilla de oferta como la lista de campos."],
  ["持久 Agent 任务缺少有效任务标识","La tarea del agente no tiene un identificador válido."],
  ["持久 Agent Session 文件名无效，请重新执行当前业务任务","El nombre de archivo de la sesión del agente no es válido; vuelve a ejecutar la tarea."],
  ["持久 Agent 任务不存在，请重新执行当前业务任务","La tarea del agente ya no existe; vuelve a ejecutarla."],
  ["当前 Agent 任务已结束，无法继续提问","La tarea del agente ya terminó y no admite más preguntas."],
  ["当前 Agent 任务已结束，无法继续等待用户操作","La tarea del agente ya terminó y no puede esperar más acciones."],
  ["持久 Agent 任务与当前业务任务不匹配，请重新执行当前业务任务","La sesión del agente no corresponde a la tarea actual; vuelve a ejecutarla."],
  ["持久 Agent Session 不存在，请重新执行当前业务任务","La sesión del agente no existe; vuelve a ejecutar la tarea."],
  ["未配置文本模型 API Key","No se ha configurado la clave de API del modelo de texto."],
  ["未配置文本模型名称","No se ha configurado el nombre del modelo de texto."],
  ["未配置文本模型 Base URL","No se ha configurado la dirección base del modelo de texto."],
  ["Pi Agent 模型注册失败","No se pudo registrar el modelo del agente."],
  ["任务失败报告通道未初始化","El canal para informar fallos de tareas aún no está listo."],
  ["用户提问通道未初始化","El canal para preguntas al usuario aún no está listo."],
  ["自定义输入选项最多只能有一个，请调整选项后重新提问","Solo puede haber una opción de respuesta personalizada; ajusta las opciones."],
  ["推荐选项不能要求用户补充输入，请调整选项后重新提问","La opción recomendada no puede exigir texto adicional; ajusta las opciones."],
  ["开始分析项目资料。","Iniciando el análisis de los documentos del proyecto."],
  ["未导入资料文件，仅根据项目参数分析。","No se importaron documentos; se analizarán los parámetros del proyecto."],
  ["正在提取资料事实。","Extrayendo datos de los documentos."],
  ["正在合并分段分析结果。","Uniendo los resultados del análisis."],
  ["资料分析完成。","Análisis de documentos completado."],
  ["正在提取可研报告关键参数与统一口径。","Extrayendo parámetros y criterios del informe de viabilidad."],
  ["关键参数与编制口径生成完成，请人工核对待补充项。已清空旧正文。","Parámetros y criterios generados. Revisa los datos pendientes; se eliminó el contenido anterior."],
  ["正在撰写：","Redactando: "],
  ["正文生成完成，开始自然化审校。","Contenido generado; comienza la revisión de redacción."],
  ["开始自然化审校。","Comienza la revisión de redacción."],
  ["继续自然化审校。","Continúa la revisión de redacción."],
  ["正在审校：","Revisando: "],
  ["自然化审校完成。","Revisión de redacción completada."],
  ["没有需要审校的章节。","No hay capítulos pendientes de revisión."],
  ["开始 AI 调整报告目录。","Iniciando el ajuste del catálogo del informe con IA."],
  ["报告目录 AI 调整完成。","Ajuste del catálogo del informe completado."],
  ["开始生成报告目录。","Iniciando la generación del catálogo del informe."],
  ["报告目录生成完成。","Catálogo del informe generado."],
  ["当前文本模型没有开启多模态，无法查看图片画面。与图片画面有关的条款判为 unknown，并说明需要人工查看图片","El modelo de texto no admite imágenes. Los criterios visuales quedan sin determinar y requieren revisión manual."],
  ["请先选择要检查的投标文件","Selecciona primero el documento de la oferta que quieres revisar."],
  ["请先完成当前文件和格式预设的检查，再进行修复","Termina primero la revisión del archivo y del formato antes de corregirlo."],
  ["AI 复核还在进行，请等复核完成后再修复","La revisión con IA sigue en curso; espera a que termine para corregir."],
  ["检查已取消","Revisión cancelada."],
  ["修复已取消","Corrección cancelada."],
  ["招标文件中没有可读取的文字","El pliego no contiene texto legible."],
  ["未在招标文件中找到技术标排版要求（字体、字号、行距、页边距等）。如果是扫描版 PDF，请在设置中改用 MinerU 解析后重试","No se encontraron requisitos de formato en el pliego. Si el PDF está escaneado, prueba el análisis con MinerU en Ajustes."],
  ["AI 未从招标文件片段中提取到可检查的格式要求，请核对招标文件是否包含技术标排版要求","La IA no encontró requisitos de formato verificables; comprueba si el pliego los incluye."],
  ["暗标合规检查数据库尚未初始化","La base de datos de revisión de oferta anónima aún no está lista."],
  ["暗标合规检查仅支持 .docx，请先在 Word / WPS 中另存为 .docx","La revisión de oferta anónima solo admite archivos DOCX; guarda el documento como DOCX."],
  ["内置预设不能修改，请先复制为我的预设","Los ajustes integrados no se pueden editar; crea primero una copia."],
  ["预设不存在，请刷新后重试","No se encontró el ajuste; actualiza e inténtalo de nuevo."],
  ["技术方案中暂无招标文件，请先在技术方案中上传招标文件，或选择招标文件","Carga o selecciona primero el pliego para la propuesta técnica."],
  ["文件解析服务尚未初始化","El servicio de análisis de archivos aún no está listo."],
  ["没有可导出的目录内容","No hay contenido del catálogo para exportar."],
  ["请先到“长嘛样”选择有效的导出模板","Selecciona primero una plantilla de exportación válida."],
  ["当前转换器最多支持六级章节标题","El conversor admite hasta seis niveles de títulos."],
  ["系统预设模板不可编辑，请先复制为我的模板","Las plantillas integradas no se pueden editar; crea primero una copia."],
  ["模板不存在或已被删除","La plantilla no existe o fue eliminada."],
  ["标书查重数据库尚未初始化","La base de datos de revisión de duplicados aún no está lista."],
  ["正文内容尚未成功提取，无法进行目录分析","No se pudo extraer el contenido; no se puede analizar el catálogo."],
  ["废标项检查数据库尚未初始化","La base de datos de revisión de causales de rechazo aún no está lista."],
  ["技术方案缓存接口尚未初始化","La caché de la propuesta técnica aún no está lista."],
  ["废标项检查存储接口尚未初始化","El almacenamiento de revisión de causales de rechazo aún no está listo."],
  ["缺少招标文件内容，无法解析无效与废标项","Falta el contenido del pliego para analizar las causales de rechazo."],
  ["缺少投标文件内容，无法开始检查","Falta el contenido de la oferta para iniciar la revisión."],
  ["请至少启用一种检查","Activa al menos un tipo de revisión."],
  ["请先完成无效与废标项解析","Completa primero el análisis de las causales de rechazo."],
  ["不支持的清理类型","El tipo de limpieza no es compatible."],
  ["正在清理，请稍候","La limpieza está en curso; espera un momento."],
  ["更新包下载不完整，请重新检查更新","La actualización se descargó de forma incompleta; vuelve a buscar actualizaciones."],
  ["未找到可下载的更新包","No se encontró una actualización para descargar."],
  ["原方案图片遗漏、重复或顺序/归属改变，请原样保留本小节全部原图引用","Faltan imágenes, están duplicadas o cambió su orden o ubicación; conserva las referencias originales de esta sección."],
  ["还原项必须提供 heading_edits 数组，无标题时填 []","La restauración debe incluir la lista heading_edits; usa [] si no hay títulos."],
  ["标题调整只能处理独立文字标题，内容须为单行文字或空字符串","Solo se pueden ajustar títulos de texto independientes, en una línea o vacíos."],
  ["仅有标题、没有正文或图片的范围应列入 unassigned","Los rangos que solo tienen título deben incluirse como no asignados."],
  ["原方案还原结果必须包含 assignments 和 unassigned 数组","La restauración debe incluir las listas de elementos asignados y no asignados."],
  ["未还原原文必须说明原因","Indica por qué no se restauró el texto original."],
  ["原方案图片不得遗漏，请将图片还原到对应小节","No se pueden omitir imágenes de la propuesta original; restáuralas en su sección."],
  ["模型未返回可用目录","El modelo no devolvió un catálogo utilizable."],
  ["请先完成资料分析","Completa primero el análisis de los documentos."],
  ["当前没有可调整的目录，请先完成报告目录生成","Primero genera el catálogo del informe."],
  ["报告目录生成的 Agent 工作空间不存在，请重新生成后再使用 AI 调整","No está disponible la sesión del catálogo del informe; vuelve a generarlo para usar el ajuste de IA."],
  ["正文生成或审校任务正在运行或已暂停，当前不能修改目录或手工改正文","La generación o revisión está en curso o en pausa; finalízala antes de modificar el catálogo o el texto."],
  ["请填写项目名称","Escribe el nombre del proyecto."],
  ["缺少章节编号","Falta el número de capítulo."],
  ["未找到要保存的章节","No se encontró el capítulo que se quería guardar."],
  ["请先填写项目名称","Escribe primero el nombre del proyecto."],
  ["请先生成报告目录","Genera primero el catálogo del informe."],
  ["请先生成关键参数","Genera primero los parámetros principales."],
  ["请先生成正文，再进行自然化审校","Genera primero el contenido para revisar su redacción."],
  ["插件操作上下文已失效","La sesión de operación del complemento ya no está disponible."],
  ["插件批量升级正在进行，请勿重复执行","Los complementos ya se están actualizando; espera a que termine el proceso."],
  ["插件不存在","El complemento no existe."],
  ["插件 manifest.json 不存在或格式错误","Falta el archivo manifest.json del complemento o tiene un formato incorrecto."],
  ["请选择 ZIP 格式的插件安装包","Selecciona un paquete de instalación ZIP."],
  ["ZIP 根目录缺少有效的 manifest.json","El ZIP no contiene un manifest.json válido en su carpeta principal."],
  ["manifest.json 中的插件 ID 缺失或格式不正确","Falta el identificador del complemento o tiene un formato incorrecto en manifest.json."],
  ["manifest.json 中缺少插件名称","Falta el nombre del complemento en manifest.json."],
  ["manifest.json 中缺少插件版本","Falta la versión del complemento en manifest.json."],
  ["插件未启用","El complemento no está activado."],
  ["插件不支持宿主事件","El complemento no admite eventos de la aplicación."],
  ["插件 manifest 不存在","Falta el manifiesto del complemento."],
  ["插件 main.cjs 不存在","Falta el archivo main.cjs del complemento."],
  ["插件缺少 activate 方法","El complemento no incluye el método activate."],
  ["Open XML 助手尚未就绪","El asistente de Open XML aún no está listo."],
  ["缺少 action","Falta la acción solicitada."],
  ["Open XML 助手执行失败，且没有 result.json","Falló el asistente de Open XML y no se generó result.json."],
  ["Word 配图引用必须是图片根目录内的相对路径","Las referencias a imágenes de Word deben ser rutas relativas dentro de la carpeta de imágenes."],
  ["授权服务返回的数据格式不完整","El servicio de licencias devolvió datos incompletos."],
  ["离线授权数据格式不完整","Los datos de la licencia sin conexión están incompletos."],
  ["离线授权签名无效","La firma de la licencia sin conexión no es válida."],
  ["离线授权不属于当前客户端","La licencia sin conexión no corresponde a esta aplicación."],
  ["离线授权不属于当前设备","La licencia sin conexión no corresponde a este dispositivo."],
  ["离线授权已过期","La licencia sin conexión ha vencido."],
  ["离线授权码格式无效","El formato del código de licencia sin conexión no es válido."],
  ["issues 每项须包含合法 type 及 problem、evidence、suggestion","Cada incidencia debe incluir un tipo válido, problema, evidencia y sugerencia."],
  ["facts 每项须包含合法 category 及 subject、value、quote","Cada hecho debe incluir una categoría válida, asunto, valor y cita."],
  ["当前不在可修复的一致性审计阶段","La revisión de coherencia no está en una etapa que permita corregirla."],
  ["请等待全部并发任务结束","Espera a que terminen todas las tareas en curso."],
  ["只能编辑本次目标小节，同一任务中不能重复出现同一小节","Solo se pueden editar las secciones seleccionadas; cada sección debe aparecer una sola vez."],
  ["请等待上一批生成或编辑任务全部结束","Espera a que terminen todas las tareas anteriores de generación o edición."],
  ["当前没有待修复的提交校验问题","No hay problemas de validación pendientes de corrección."],
  ["请选择测试数据文件夹","Selecciona la carpeta de datos de prueba."],
  ["所选测试数据文件夹不存在","La carpeta de datos de prueba seleccionada no existe."],
  ["根节点必须是对象","El elemento raíz debe ser un objeto."],
  ["profile.watermarkEnabled 必须是 true 或 false","profile.watermarkEnabled debe ser true o false."],
  ["MinerU-Agent 解析完成但未返回 markdown_url","MinerU-Agent terminó el análisis, pero no devolvió la dirección del texto."],
  ["MinerU 精准解析完成但未返回 full_zip_url","MinerU terminó el análisis, pero no devolvió la dirección del archivo."],
  ["知识库文档不存在","El documento de la base de conocimiento no existe."],
  ["知识库文件夹不存在","La carpeta de la base de conocimiento no existe."],
  ["目标知识库文件夹不存在","La carpeta de destino de la base de conocimiento no existe."],
  ["目标文档不在目标文件夹中","El documento no está en la carpeta de destino."],
  ["目标文档不存在","El documento de destino no existe."],
  ["AI 返回结果缺少 items 数组","La respuesta de IA no incluye la lista de elementos."],
  ["AI 返回结果缺少 matches 数组","La respuesta de IA no incluye la lista de coincidencias."],
  ["AI 返回结果缺少 matches/new_items/discarded 数组","La respuesta de IA no incluye las listas de coincidencias, elementos nuevos o descartados."],
  ["缺少正文 block，请重新上传文档","Falta el contenido del documento; vuelve a cargarlo."],
  ["缺少候选知识条目，请等待条目提取完成","Faltan elementos de conocimiento; espera a que termine la extracción."],
  ["该文档正在处理中，请完成后再删除","El documento se está procesando; espera a que termine para eliminarlo."],
  ["该文档正在处理中，请完成后再移动","El documento se está procesando; espera a que termine para moverlo."],
  ["文档文件不存在，无法移动","El archivo del documento no existe y no se puede mover."],
  ["目标文件夹中已存在同名文档目录，无法移动","Ya existe una carpeta de documento con ese nombre en el destino; no se puede mover."],
  ["正文生成工作空间暂不支持 AI 调整","El espacio de redacción aún no admite ajustes con IA."],
  ["当前没有可执行任务","No hay ninguna tarea disponible."],
  ["请输入调整要求","Escribe las instrucciones para el ajuste."],
  ["上一条要求正在处理中，请等待 Agent 回复","La solicitud anterior sigue en proceso; espera la respuesta del agente."],
  ["未找到无效投标与废标项解析任务","No se encontró la tarea de análisis de ofertas inválidas y causales de rechazo."],
  ["请先上传招标文件，再开始解析","Carga el pliego antes de iniciar el análisis."],
  ["请先完成多标段识别，再开始解析招标文件","Identifica los lotes antes de analizar el pliego."],
  ["请先选择本次投标范围，再开始解析招标文件","Selecciona el alcance de la oferta antes de analizar el pliego."],
  ["当前投标范围已失效，请重新选择标段","El alcance seleccionado ya no es válido; selecciona nuevamente los lotes."],
  ["未找到可重新解析的招标文件解析项","No se encontró ningún apartado para volver a analizar."],
  ["当前 Agent 问题已失效","La pregunta del agente ya no está disponible."],
  ["请选择一个有效选项","Selecciona una opción válida."],
  ["请输入具体要求","Escribe las instrucciones concretas."],
  ["源持久 Agent Session 不存在，无法创建分叉任务","No existe la sesión original del agente; no se puede crear una tarea derivada."],
  ["源持久 Agent Session 文件不存在，无法创建分叉任务","No se encuentra el archivo de la sesión original; no se puede crear una tarea derivada."],
  ["Pi SDK 未生成分叉 Session 文件","El agente no generó el archivo de la sesión derivada."],
  ["调整要求不能为空","Escribe las instrucciones para el ajuste."],
  ["当前没有可调整的全局事实，请先完成全局事实设定","Primero completa la definición de hechos globales."],
  ["当前没有可调整的目录，请先完成目录生成","Primero genera el catálogo."],
  ["未识别到至少两个有效标段","No se identificaron al menos dos lotes válidos."],
  ["AI 服务尚未初始化","El servicio de IA aún no está listo."],
  ["请先上传招标文件，再进行多标段识别","Carga el pliego antes de identificar los lotes."],
  ["全局事实结果缺少 groups","La respuesta de hechos globales no contiene grupos."],
  ["全局事实分段结果缺少 groups","La respuesta parcial de hechos globales no contiene grupos."],
  ["全局事实补充结果缺少 patches","La respuesta complementaria no contiene modificaciones."],
  ["请先上传招标文件，再生成全局事实","Carga el pliego antes de generar los hechos globales."],
  ["原方案读取服务尚未初始化","El servicio de lectura de la propuesta original aún no está listo."],
  ["请先上传原方案，再生成全局事实","Carga la propuesta original antes de generar los hechos globales."],
  ["请先生成目录，再生成全局事实","Genera el catálogo antes de los hechos globales."],
  ["本地图片路径不能为空","Selecciona una imagen local."],
  ["图片格式不受支持或文件已损坏","El formato de imagen no es compatible o el archivo está dañado."],
  ["图片压缩结果为空","La compresión de la imagen no produjo contenido."],
  ["Agent 代理请求缺少 messages","La solicitud del agente no contiene mensajes."],
  ["Agent 代理请求缺少响应消费函数","La solicitud del agente no tiene un procesador de respuesta."],
  ["请先填写 OpenRouter API Key","Introduce primero la clave de API de OpenRouter."],
  ["请先填写 OpenRouter 生图模型名称","Introduce primero el nombre del modelo de imágenes de OpenRouter."],
  ["当前生图服务商暂不支持正文配图","El proveedor de imágenes actual no admite ilustraciones para el contenido."],
  ['目录生成与审核完成', 'Catálogo generado y revisado'],
  ['全局事实变量生成完成。', 'Preparación de datos generales completada.'],
  ['开始生成全局事实变量。', 'Iniciando la preparación de datos generales.'],
  ['未选择参考知识库。', 'No se seleccionó una base de conocimiento de referencia.'],
  ['正在准备全局事实工作区材料。', 'Preparando los documentos para los datos generales.'],
  ['Agent 正在整理全局事实变量。', 'El agente está organizando los datos generales.'],
  ['技术方案目录已确认，开始生成子目录', 'Catálogo confirmado; se generan los subcapítulos.'],
  ['子目录生成完成，正在准备最终审核', 'Subcapítulos generados; preparando la revisión final.'],
  ['技术方案目录已确认，Agent 正在分配 AI 生成小节', 'Catálogo confirmado; el agente organiza las secciones que generará la IA.'],
  ['AI 生成小节数量存在差异，等待用户决定', 'La cantidad de secciones generadas con IA difiere de la prevista; espera una decisión.'],
  ['目录生成任务已返回，正在等待投标模版提取任务', 'Catálogo generado; esperando la extracción de la plantilla.'],
  ['目录生成完成', 'Catálogo generado'],
  ['所选一级目录已整理完成', 'Capítulos seleccionados organizados'],
  ['开始 AI 调整目录', 'Iniciando el ajuste del catálogo con IA'],
  ['目录 AI 调整完成', 'Ajuste del catálogo completado'],
  ['开始 AI 调整全局事实', 'Iniciando el ajuste de los hechos globales con IA'],
  ['全局事实 AI 调整完成', 'Ajuste de hechos globales completado'],
  ['目录生成的 Agent 工作空间不存在，请重新生成目录后再使用 AI 调整', 'No está disponible la sesión del catálogo. Vuelve a generarlo para usar el ajuste de IA.'],
  ['全局事实设定的 Agent 工作空间不存在，请重新生成后再使用 AI 调整', 'No está disponible la sesión de hechos globales. Vuelve a generarlos para usar el ajuste de IA.'],
  ['Pi Agent 空闲', 'Agente inactivo'],
  ['The response was filtered due to the prompt triggering our content management policy.', 'El proveedor bloqueó esta respuesta con su filtro de contenido.'],
  ['投标文件正文导出修复', 'Corrección de la propuesta para exportar'],
  ['全局事实变量生成', 'Preparación de datos generales'],
  ['全局事实设定 AI 调整', 'Ajuste de datos generales con IA'],
  ['技术方案目录 AI 调整', 'Ajuste del catálogo técnico con IA'],
  ['修改正文小节：', 'Modificación de la sección: '],
  ['原方案正文还原 Agent', 'Restauración de la propuesta original'],
  ['一致性修复', 'Corrección de coherencia'],
  ['提交问题修复', 'Corrección de problemas antes de entregar'],
  ['可研报告目录 AI 调整', 'Ajuste del catálogo del informe de viabilidad'],
  ['可研报告目录生成', 'Generación del catálogo del informe de viabilidad'],
  ['暗标 AI 复核', 'Revisión de la oferta anónima con IA'],
  ['暗标 AI 修复', 'Corrección de la oferta anónima con IA'],
  ['Savia智能体任务', 'Tarea del agente'],
  ['已收到回答，Agent 正在继续执行', 'Respuesta recibida; el agente continúa'],
  ['Pi Agent 长时间无进展，已停止本轮任务', 'El agente no avanzó durante el tiempo permitido y detuvo la tarea'],
  ['投标文件正文生成', 'Redacción de la propuesta'],
  ['技术方案一级目录生成', 'Generación del catálogo técnico inicial'],
  ['技术方案目录生成 V2', 'Generación del catálogo técnico V2'],
  ['投标模版提取', 'Extracción de la plantilla de oferta'],
  ['Agent 正在等待您的回答', 'El agente espera tu respuesta'],
  ['Agent 正在等待您的操作', 'El agente espera tu acción'],
  ['已收到用户操作，Agent 正在继续执行', 'Respuesta recibida; el agente continúa'],
  ['Agent 正在生成子目录', 'El agente está generando las secciones'],
  ['Agent 正在审核并修复目录', 'El agente está revisando y corrigiendo el catálogo'],
  ['Agent 正在分配 AI 生成小节', 'El agente está organizando las secciones generadas con IA'],
  ['Agent 正在询问如何处理小节数量差异', 'El agente solicita una decisión sobre la cantidad de secciones'],
  ['Agent 正在压缩上下文', 'El agente está preparando el contexto'],
  ['Agent 上下文压缩完成', 'El contexto del agente está listo'],
  ['Agent 正在继续执行下一阶段', 'El agente continúa con la siguiente etapa'],
  ['开始生成一级目录', 'Generando el catálogo inicial'],
  ['一级目录已生成，等待用户确认', 'Catálogo inicial generado; espera tu confirmación'],
  ['一级目录已确认，目录生成与投标模版提取并行开始', 'Catálogo confirmado; se generan las secciones y se extrae la plantilla'],
  ['投标模版提取任务已返回，正在等待目录生成任务', 'Plantilla procesada; esperando la generación del catálogo'],
  ['招标文件解析完成', 'Análisis del pliego completado'],
  ['开始解析招标文件', 'Iniciando el análisis del pliego'],
  ['开始重新解析选中的招标文件解析项', 'Reanalizando los apartados seleccionados del pliego'],
  ['开始重新解析全部招标文件解析项', 'Reanalizando todos los apartados del pliego'],
  ['必填解析项未完成：', 'Faltan apartados obligatorios del análisis: '],
  ['，请重新解析失败项', '; vuelve a analizar los apartados fallidos'],
  ['项目概述', 'Resumen del proyecto'],
  ['技术评分要求', 'Requisitos de puntuación técnica'],
  ['项目信息', 'Información del proyecto'],
  ['甲方信息', 'Información de la entidad'],
  ['交货和服务要求', 'Requisitos de entrega y servicio'],
  ['响应文件要求', 'Requisitos de la oferta'],
  ['解析失败：', ': error de análisis: '],
  ['未知错误', 'Error desconocido'],
  ['未找到选择的投标范围', 'No se encontró la sección de licitación seleccionada.'],
  ['生成投标范围工作副本失败，请重新提取标段', 'No se pudo preparar la copia del alcance. Vuelve a identificar las secciones.'],
  ['技术方案数据库尚未初始化', 'La base de datos del proyecto aún no está lista.'],
  ['请先上传招标文件，再生成全局事实', 'Carga primero el pliego para generar los datos generales.'],
  ['请先生成目录，再生成全局事实', 'Genera primero el catálogo para preparar los datos generales.'],
  ['请先上传原方案，再生成全局事实', 'Carga primero la propuesta original para generar los datos generales.'],
  ['正文目标字数不足以为每个小节分配字数，请调整字数配置或目录规模。', 'La extensión prevista no alcanza para todas las secciones. Ajusta la extensión o el tamaño del catálogo.'],
  ['已设置全文字数要求，正文编排必须为每个目标小节提供正整数 target_words。', 'Cada sección necesita una cantidad de palabras válida según la extensión configurada.'],
  ['正文编排决策必须是对象', 'El plan de redacción tiene un formato no válido.'],
  ['正文编排决策缺少 knowledge.item_ids', 'El plan de redacción no contiene los identificadores de las fuentes.'],
  ['正文编排决策的 target_words 必须是非负整数', 'La cantidad de palabras del plan debe ser un entero no negativo.'],
  ['正文编排决策的配图适配性评分必须是 0-10 的整数', 'La valoración de imágenes debe ser un entero entre 0 y 10.'],
  ['正文编排决策缺少 writing_focus', 'El plan de redacción no indica el enfoque de la sección.'],
  ['正文编排决策缺少 table.needed', 'El plan de redacción no indica si se necesita una tabla.'],
  ['扩写 replace 结果缺少 target_text', 'La ampliación no indica qué texto debe reemplazarse.'],
  ['扩写结果缺少 content', 'La ampliación no contiene texto nuevo.'],
  ['当前章节正文为空，replace target_text 无法执行替换', 'La sección está vacía; no se puede reemplazar el texto indicado.'],
  ['原方案读取服务尚未初始化', 'El servicio de lectura de la propuesta original aún no está listo.'],
  ['单小节重新生成不支持重试内容矫正', 'La corrección del contenido no puede reintentarse al regenerar una sola sección.'],
  ['未找到要重新生成的正文小节', 'No se encontró la sección que se quería regenerar.'],
  ['只有正文小节全部生成成功后，才能重试内容矫正', 'Genera todas las secciones correctamente antes de reintentar la corrección.'],
  ['当前目录没有字数控制生效快照，请重新生成目录', 'Falta la configuración de extensión del catálogo. Vuelve a generarlo.'],
  ['当前正文任务正在执行，请等待完成后再修改小节', 'La generación está en curso. Espera a que termine antes de editar la sección.'],
  ['当前没有正在生成的可研正文任务。', 'No hay una generación del informe de viabilidad en curso.'],
  ['标书查重任务服务尚未初始化', 'El servicio de revisión de duplicados aún no está listo.'],
  ['当前没有等待确认的一级目录任务', 'No hay un catálogo inicial pendiente de confirmación.'],
  ['请先完成技术评分要求解析，再生成目录', 'Analiza primero los requisitos de puntuación técnica para generar el catálogo.'],
  ['请先确认是否以无技术评分项模式生成目录', 'Confirma primero si deseas generar el catálogo sin criterios de puntuación técnica.'],
  ['投标模版提取任务已返回，但模版和字段清单不完整', 'La extracción terminó, pero la plantilla y su lista de campos están incompletas.'],
  ['当前标段缺少有效范围，请重新识别', 'La sección seleccionada no tiene un alcance válido. Vuelve a detectarla.'],
  ['原始招标文件缺失，请重新上传招标文件', 'Falta el pliego original. Vuelve a cargarlo.'],
  ['原始招标文件内容为空，请重新上传', 'El pliego está vacío. Vuelve a cargarlo.'],
  ['文件导入服务尚未初始化', 'El servicio de importación de archivos aún no está listo.'],
  ['当前正文生成任务正在运行或已暂停，请先完成任务再编辑正文', 'La generación está en curso o en pausa. Termínala antes de editar el contenido.'],
  ['正文生成任务正在运行或暂停中，请结束后再调整目录', 'La generación está en curso o en pausa. Termínala antes de ajustar el catálogo.'],
  ['缺少项目名称与概况', 'Faltan el nombre y la descripción del proyecto.'],
  ['一级目录生成结果已变化，请重新打开后再选择', 'El catálogo cambió. Ábrelo de nuevo para seleccionar las secciones.'],
  ['当前目录中未找到该章节', 'No se encontró esa sección en el catálogo actual.'],
  ['未找到要删除的招标文件', 'No se encontró el archivo de licitación que se quería eliminar.'],
  ['已移除招标文件', 'Archivo de licitación eliminado.'],
  ['请先完成多标段识别，再选择投标范围', 'Detecta primero las secciones del proceso y después selecciona el alcance.'],
  ['技术方案已重置', 'Propuesta técnica restablecida.'],
  ['请先生成目录，再生成正文', 'Genera primero el catálogo y luego el contenido.'],
  ['请先完成全局事实设定，再生成正文', 'Completa primero los datos generales y luego genera el contenido.'],
  ['请先上传原方案，再生成正文', 'Carga primero la propuesta original y luego genera el contenido.'],
  ['没有可继续的已暂停正文生成任务', 'No hay una generación de contenido en pausa para continuar.'],
  ['当前目录没有标记为“AI生成”的正文小节', 'El catálogo no tiene secciones marcadas para generar con IA.'],
  ['Agent 认为当前任务无法按原要求继续：', 'El agente considera que no puede continuar con los requisitos actuales:'],
  ['继续执行需要降低质量要求：数量、篇幅、专业性和资料依据都会放宽，内容可能不完整、与项目实际不符，需要您后续人工核对。是否终止当前任务？', 'Para continuar habría que reducir los requisitos de cantidad, extensión, calidad profesional y respaldo documental. El contenido podría estar incompleto o no corresponder al proyecto y necesitaría revisión manual. ¿Deseas detener la tarea?'],
  ['按推荐方案处理', 'Continuar con la opción recomendada'],
  ['调整目录安排', 'Ajustar la estructura del catálogo'],
  ['保持当前目录', 'Mantener el catálogo actual'],
  ['补充处理要求', 'Añadir instrucciones'],
  ['终止任务', 'Detener la tarea'],
  ['降低质量继续', 'Continuar con requisitos de calidad reducidos'],
  ['放宽质量要求，只保证流程能完成，结果需要人工核对', 'Reduce las exigencias para continuar; el resultado requiere revisión manual'],
  ['结束当前任务，可补充资料或调整设置后重新执行', 'Detiene la tarea; puedes añadir información o ajustar la configuración y volver a intentarlo'],
  ['输入您希望 Agent 如何继续处理', 'Indica cómo debe continuar el agente'],
  ['正在调用工具：', 'Usando herramienta: '],
  [' 执行完成', ': completada'],
  [' 执行失败', ': falló'],
  ['正在启动 ', 'Iniciando '],
  ['可研报告目录AI调整', 'ajuste del catálogo del informe de viabilidad con IA'],
  ['可研报告正文生成', 'generación del informe de viabilidad'],
  ['可研报告目录生成', 'generación del catálogo del informe de viabilidad'],
  ['可研项目资料分析', 'análisis de documentos del informe de viabilidad'],
  ['可研关键参数生成', 'generación de parámetros del informe de viabilidad'],
  ['可行性研究报告', 'informe de viabilidad'],
  ['全局事实AI调整', 'ajuste de hechos globales con IA'],
  ['暗标格式要求提取', 'extracción de requisitos de oferta anónima'],
  ['暗标合规检查', 'revisión de oferta anónima'],
  ['暗标自动修复', 'corrección automática de oferta anónima'],
  ['无效与废标项解析', 'análisis de causales de rechazo'],
  ['标书查重分析', 'análisis de duplicados'],
  ['废标项检查', 'revisión de causales de rechazo'],
  ['多标段识别', 'identificación de secciones'],
  ['招标文件解析', 'análisis del pliego'],
  ['全局事实设定', 'preparación de hechos globales'],
  ['目录AI调整', 'ajuste del catálogo con IA'],
  ['目录生成', 'generación del catálogo'],
  ['正文生成', 'generación del contenido'],
  ['标书查重', 'revisión de duplicados'],
  ['技术方案', 'propuesta técnica'],
  ['标书查重缓存已清空', 'Se borró la caché de la revisión de duplicados'],
  ['正在启动元数据分析', 'Iniciando el análisis de metadatos'],
  ['等待元数据提取完成后开始目录分析', 'Esperando los metadatos para analizar la estructura'],
  ['等待正文内容提取完成后开始正文比对', 'Esperando el contenido para comparar los textos'],
  ['等待正文内容提取完成后开始图片比对', 'Esperando el contenido para comparar las imágenes'],
  ['正在提取正文内容', 'Extrayendo el contenido de los documentos'],
  ['正在提取投标文件元数据', 'Extrayendo metadatos de las ofertas'],
  ['正在准备目录分析', 'Preparando el análisis de la estructura'],
  ['正在提取投标文件目录', 'Extrayendo la estructura de las ofertas'],
  ['部分文件目录分析失败', 'Falló el análisis de la estructura de algunos archivos'],
  ['目录分析完成', 'Análisis de la estructura completado'],
  ['正在准备正文比对', 'Preparando la comparación de textos'],
  ['正文比对完成', 'Comparación de textos completada'],
  ['正在准备图片比对', 'Preparando la comparación de imágenes'],
  ['部分文件图片比对失败', 'Falló la comparación de imágenes de algunos archivos'],
  ['图片比对完成', 'Comparación de imágenes completada'],
  ['元数据提取完成，等待正文内容用于目录分析', 'Metadatos extraídos; esperando el contenido para analizar la estructura'],
  ['元数据提取完成，等待正文内容用于正文比对', 'Metadatos extraídos; esperando el contenido para comparar los textos'],
  ['元数据提取完成，等待正文内容用于图片比对', 'Metadatos extraídos; esperando el contenido para comparar las imágenes'],
  ['部分文件提取失败', 'No se pudo extraer información de algunos archivos'],
  ['元数据分析完成', 'Análisis de metadatos completado'],
  ['元数据分析失败', 'Falló el análisis de metadatos'],
  ['招标文件句子白名单生成失败，继续对比投标文件目录：', 'No se pudieron identificar las frases del pliego; continúa la comparación de la estructura de las ofertas: '],
  ['招标文件句子白名单生成失败，继续比对投标正文：', 'No se pudieron identificar las frases del pliego; continúa la comparación de los textos de las ofertas: '],
  [' 正文比对失败：', ': falló la comparación del texto: '],
  ['无法确定是否违反要求，需要人工确认', 'No se puede determinar si incumple el requisito; requiere revisión manual'],
  ['自动修复无法处理', 'La corrección automática no puede resolverlo'],
  ['需要人工核对是否满足招标要求', 'Hay que verificar manualmente si cumple el pliego'],
  ['修复后新出现，请人工核对', 'Apareció después de la corrección; revisa el caso manualmente'],
  ['自动修复未完成：', 'La corrección automática no terminó: '],
  ['正在读取文档', 'Leyendo el documento'],
  ['正在解析样式与主题', 'Analizando estilos y temas'],
  ['正在分析段落格式', 'Analizando el formato de los párrafos'],
  ['正在识别目录与标题', 'Identificando el índice y los títulos'],
  ['正在读取图片', 'Leyendo las imágenes'],
  ['正在汇总结果', 'Reuniendo los resultados'],
  ['正在写出修改', 'Guardando los cambios'],
  ['正在校验修改后的文档', 'Verificando el documento modificado'],
  ['正在修复段落与文字格式', 'Corrigiendo el formato de párrafos y texto'],
  ['正在写出修复副本', 'Guardando la copia corregida'],
  ['正在校验修复副本', 'Verificando la copia corregida'],
  ['检查完成，未发现问题。', 'Revisión terminada sin hallazgos.'],
  ['检查完成', 'Revisión completada'],
  ['导出完成', 'Exportación completada'],
  ['修改完成', 'Cambios completados'],
  ['修复完成', 'Corrección completada'],
];

// Translate complete messages before their shorter component phrases.
const SPANISH_ORDERED = [...SPANISH].sort((a, b) => b[0].length - a[0].length);

/** Translate known application messages without rewriting tender content or unknown errors. */
export function localizeRuntimeText(text: string, language: string): string {
  if (language === 'en' && text) {
    const progress = localizeEnglishProgress(text);
    if (progress !== text) return progress;
    const unwrapped = text.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
    return bilingualEnglish.get(unwrapped) || text
      .replace(/^AI 正在首次提取知识条目，已完成 (\d+)\/(\d+) 段[。.]?$/, 'AI is extracting knowledge entries: $1 of $2 sections.')
      .replace(/^AI 正在补充遗漏知识条目，已完成 (\d+)\/(\d+) 段[。.]?$/, 'AI is recovering missing knowledge entries: $1 of $2 sections.');
  }
  if (language !== 'es' || !text) return text;
  const blindProgress = localizeBlindCheckProgress(text, language);
  if (blindProgress !== text) return blindProgress;
  const unwrapped = text.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
  const bilingual = bilingualSpanish.get(unwrapped);
  if (bilingual) return bilingual;
  const translated = (extractKnownDynamicSpanish(unwrapped) || text)
    .replace(/检查完成：高风险 (\d+) 处、中风险 (\d+) 处、低风险 (\d+) 处。/g, 'Revisión terminada: $1 casos de riesgo alto, $2 de riesgo medio y $3 de riesgo bajo.')
    .replace(/已尝试修改，复查仍有 (\d+) 处/g, 'Se intentó corregir; la revisión encontró $1 casos pendientes')
    .replace(/正文内容提取 (\d+)\/(\d+)/g, 'Extracción de contenido: $1 de $2')
    .replace(/元数据提取 (\d+)\/(\d+)/g, 'Extracción de metadatos: $1 de $2')
    .replace(/目录提取 (\d+)\/(\d+)/g, 'Extracción de estructuras: $1 de $2')
    .replace(/正文比对 (\d+)\/(\d+)（(\d+)\/(\d+) 句）/g, 'Comparación de textos: archivo $1 de $2, frase $3 de $4')
    .replace(/正文比对 (\d+)\/(\d+)/g, 'Comparación de textos: $1 de $2 archivos')
    .replace(/图片比对 (\d+)\/(\d+)/g, 'Comparación de imágenes: $1 de $2 archivos')
    .replace(/正在分析第 (\d+)\/(\d+) 段资料。/g, 'Analizando el fragmento $1 de $2.')
    .replace(/继续生成 (\d+) 个未完成章节。/g, 'Continuando la generación de $1 capítulos pendientes.')
    .replace(/开始生成 (\d+) 个章节正文。/g, 'Generando el contenido de $1 capítulos.')
    .replace(/开始审校 (\d+) 个已生成章节。/g, 'Revisando $1 capítulos generados.')
    .replace(/全局事实第 (\d+) 项缺少 id、title 或 content/g, 'El hecho global $1 no contiene id, título o contenido.')
    .replace(/全局事实分段第 (\d+) 项缺少 id、title 或 content/g, 'El hecho global parcial $1 no contiene id, título o contenido.')
    .replace(/全局事实补充第 (\d+) 项缺少 content/g, 'El hecho global complementario $1 no contiene contenido.')
    .replace(/正文编排结果包含非目标 AI 小节：/g, 'El plan de contenido incluye una sección de IA no seleccionada: ')
    .replace(/正文编排结果重复提交小节：/g, 'El plan de contenido repite la sección: ')
    .replace(/正文编排结果引用了不存在的知识库条目：/g, 'El plan de contenido hace referencia a un elemento inexistente de la base de conocimiento: ')
    .replace(/正文编排结果缺少表格用途：/g, 'El plan de contenido no indica el uso de la tabla: ')
    .replace(/正文编排结果为无表格目录填写了表格用途：/g, 'El plan indica el uso de una tabla en una sección sin tabla: ')
    .replace(/正文编排结果缺少目标节点：/g, 'El plan de contenido no incluye la sección: ')
    .replace(/恢复正文文件时原位置被占用：/g, 'No se pudo restaurar el archivo porque su ubicación está ocupada: ')
    .replace(/原方案图片资源缺失，请重新导入原 Word：/g, 'Falta una imagen de la propuesta original; vuelve a importar el archivo Word: ')
    .replace(/：无法保存 Word 原件，/g, ': no se pudo guardar el archivo Word original: ')
    .replace(/插件正在(.+?)，请稍后再试/g, 'El complemento está en una operación ($1); inténtalo más tarde.')
    .replace(/解压失败: /g, 'No se pudo descomprimir: ')
    .replace(/插件 manifest.id 与市场 ID 不一致：应为 /g, 'El identificador del complemento no coincide; debe ser: ')
    .replace(/更新阶段"(.+?)"失败：/g, 'Falló la etapa de actualización «$1»: ')
    .replace(/非法文件路径：/g, 'Ruta de archivo no válida: ')
    .replace(/Pi Agent 保留路径不允许作为任务文件：/g, 'La ruta reservada del agente no se puede usar como archivo de tarea: ')
    .replace(/文件路径越界：/g, 'La ruta está fuera del espacio de trabajo: ')
    .replace(/正在执行其他任务/g, 'está ejecutando otra tarea')
    .replace(/Agent 未返回可解析的 JSON：/g, 'El agente no devolvió JSON válido: ')
    .replace(/不是合法 JSON：/g, ' no contiene JSON válido: ')
    .replace(/正在滚动审阅投标包第 (\d+)\/(\d+) 段。/g, 'Revisando el fragmento $1 de $2 de la oferta.')
    .replace(/正在识别第 (\d+)\/(\d+) 段错别字。/g, 'Buscando errores de escritura en el fragmento $1 de $2.')
    .replace(/正在滚动检查投标包第 (\d+)\/(\d+) 段逻辑。/g, 'Revisando la lógica del fragmento $1 de $2 de la oferta.')
    .replace(/正在定稿废标项风险第 (\d+)\/(\d+) 批。/g, 'Preparando los riesgos de rechazo del lote $1 de $2.')
    .replace(/正在定稿逻辑问题第 (\d+)\/(\d+) 批。/g, 'Preparando los problemas de lógica del lote $1 de $2.')
    .replace(/发现 (\d+) 项/g, 'encontró $1 resultados')
    .replace(/未发现问题/g, 'no encontró problemas')
    .replace(/检查完成，(\d+) 个任务失败。/g, 'Revisión terminada; fallaron $1 tareas.')
    .replace(/(\d+) 个检查任务失败/g, 'Fallaron $1 tareas de revisión')
    .replace(/AI 正在首次提取知识条目，已完成 (\d+)\/(\d+) 段/g, 'La IA está extrayendo entradas de conocimiento: $1 de $2 fragmentos.')
    .replace(/AI 正在补充遗漏知识条目，已完成 (\d+)\/(\d+) 段/g, 'La IA está recuperando entradas omitidas: $1 de $2 fragmentos.')
    .replace(/已提取 (\d+) 条候选知识，可开始自动分段匹配/g, 'Se extrajeron $1 entradas; ya se puede iniciar la asociación de párrafos.')
    .replace(/已提取 (\d+) 条候选知识，正在自动匹配段落/g, 'Se extrajeron $1 entradas; asociando párrafos automáticamente.')
    .replace(/开始按上下文自动分段匹配，共 (\d+) 段/g, 'Iniciando la asociación automática de $1 fragmentos.')
    .replace(/AI 正在匹配段落 第 (\d+)\/(\d+) 段/g, 'La IA está asociando el fragmento $1 de $2.')
    .replace(/AI 正在补漏遗漏段落 (\d+)\/(\d+)，剩余 (\d+) 个 block/g, 'La IA está recuperando párrafos omitidos ($1/$2); quedan $3 bloques.')
    .replace(/整理完成，共 (\d+) 条，覆盖率 (\d+)%/g, 'Procesamiento completado: $1 entradas, cobertura del $2%.')
    .replace(/整理完成，共 (\d+) 条/g, 'Procesamiento completado: $1 entradas.')
    .replace(/图片读取或压缩失败（(.+?)）：/g, 'No se pudo leer o comprimir la imagen ($1): ')
    .replace(/分类文件结构无效，请修改 (.+?) 后重新提交路径：/g, 'La estructura del archivo de clasificación no es válida; corrige $1 y vuelve a enviarlo: ')
    .replace(/小节 (.+?) 的 figure id 为空或重复：/g, 'El identificador de imagen de la sección $1 está vacío o repetido: ')
    .replace(/图片 (.+?) 必须有一个 img 和一个非空提示词，不能嵌套 figure/g, 'La imagen $1 debe tener un elemento img y una descripción no vacía, sin figure anidados.')
    .replace(/图片 (.+?) 的画框比例无效/g, 'La proporción del marco de la imagen $1 no es válida.')
    .replace(/图片 (.+?) 的生成方式无效，请按配图类型对照表填写/g, 'El método de generación de la imagen $1 no es válido; revisa los tipos de imagen.')
    .replace(/小节 (.+?) 存在 figure 之外的图片，请先修复正文结构/g, 'La sección $1 contiene imágenes fuera de figure; corrige la estructura.')
    .replace(/读取 (.+?) 失败：/g, 'No se pudo leer $1: ')
    .replace(/其他证书\[(\d+)\]\.validityMode 无效/g, 'El modo de vigencia del certificado $1 no es válido')
    .replace(/员工\[(\d+)\]\.idValidityMode 无效/g, 'El modo de vigencia de la identificación del empleado $1 no es válido')
    .replace(/业绩\[(\d+)\]\.projectType 无效/g, 'El tipo de proyecto de la experiencia $1 no es válido')
    .replace(/原文第 (\d+) 行已覆盖或重复列入未还原范围/g, 'La línea $1 ya está cubierta o repetida entre los rangos no restaurados')
    .replace(/第 (\d+)-(\d+) 行表格被切断，请完整分配/g, 'La tabla de las líneas $1 a $2 está dividida; asígnala completa')
    .replace(/原文第 (\d+) 行未交代去向，请还原或填写未还原原因/g, 'No se indicó el destino de la línea $1; restáurala o explica por qué no se restauró')
    .replace(/其他证书\[(\d+)\]/g, 'certificado[$1]')
    .replace(/员工\[(\d+)\]/g, 'empleado[$1]')
    .replace(/业绩\[(\d+)\]/g, 'experiencia[$1]')
    .replace(/其他资料\[(\d+)\]/g, 'otro material[$1]')
    .replace(/准备重新生成正文小节：(.+?)。/g, 'Preparando la regeneración de la sección $1.')
    .replace(/已有正文 (\d+) 节保留，不重新生成；本次补齐 (\d+) 节。/g, 'Se conservan $1 secciones existentes; se completarán $2 secciones.')
    .replace(/开始重试 (\d+) 个失败或未完成正文小节。/g, 'Reintentando $1 secciones fallidas o pendientes.')
    .replace(/文本模型并发上限：(\d+)。/g, 'Límite de solicitudes simultáneas al modelo: $1.')
    .replace(/正文 Agent 开始基础编排，本次处理 (\d+) 个目录节点。/g, 'El agente organiza el contenido de $1 secciones del catálogo.')
    .replace(/本次 (\d+) 个小节的编排及配图标记已保存。/g, 'Se guardó la organización y las referencias de imágenes de $1 secciones.')
    .replace(/开始原方案还原：完整原方案交由 Agent 分析，(\d+) 个候选小节。/g, 'El agente empieza a restaurar la propuesta original en $1 posibles secciones.')
    .replace(/原方案还原完成：已还原 (\d+) 个小节，未还原范围 (\d+) 处，还原率 ([\d.]+|—)%。/g, (_match, sections, pending, rate) => `Restauración completada: ${sections} ${sections === '1' ? 'sección' : 'secciones'}, ${pending} ${pending === '1' ? 'fragmento pendiente' : 'fragmentos pendientes'} y ${rate}% restaurado.`)
    .replace(/正文文件已保存：(.+?)，(\d+) 字（(\d+)\/(\d+)）。/g, 'Contenido guardado: $1, $2 palabras ($3/$4).')
    .replace(/小节全部完成，共 (\d+) 节。/g, 'Todas las secciones están listas: $1 en total.')
    .replace(/Word 已保存：(.+?)（(\d+)\/(\d+)）。/g, 'Word guardado: $1 ($2/$3).')
    .replace(/转换完成，共 (\d+) 个 Word 文件。/g, 'Conversión completada: $1 archivos Word.')
    .replace(/目录生效字数配置：最少 (\d+|不限制) 字，最多 (\d+|不限制) 字，每小节建议 (\d+|不控制) 字。/g, (_match, min, max, perSection) => `Extensión configurada: mínimo ${min === "不限制" ? "sin límite" : min} palabras, máximo ${max === "不限制" ? "sin límite" : max} y sugerencia por sección ${perSection === "不控制" ? "sin límite" : perSection} .`.replace(' .', '.'))
    .replace(/本次编排目标字数：(\d+|未设置)；全文基准：(\d+|未设置) 字。/g, (_match, target, total) => `Extensión prevista: ${target === "未设置" ? "sin definir" : target} palabras; referencia total: ${total === "未设置" ? "sin definir" : total}.`)
    .replace(/整体编排完成：表格候选 (\d+) 个，入选 (\d+) 个。/g, 'Organización completada: $1 tablas propuestas, $2 seleccionadas.')
    .replace(/整体编排完成：表格候选 (\d+) 个，保持现有编排。/g, 'Organización completada: $1 tablas propuestas; se conserva la organización existente.')
    .replace(/字数校正：(\d+) → (\d+) 字（要求 (\d+|不限)～(\d+|不限)），改写 (\d+) 节/g, (_match, before, after, min, max, sections) => `Ajuste de extensión: ${before} → ${after} palabras (mínimo ${min === "不限" ? "sin límite" : min}, máximo ${max === "不限" ? "sin límite" : max}); ${sections} secciones reescritas`)
    .replace(/，失败 (\d+) 节——/g, '; fallaron $1 secciones: ')
    .replace(/去表格结束：转换 (\d+) 节，(\d+) 节保留表格——/g, 'Retirada de tablas terminada: $1 secciones convertidas y $2 conservaron tablas: ')
    .replace(/去表格完成，已处理 (\d+) 个小节，图片表格保留。/g, 'Retirada de tablas completada en $1 secciones; se conservan las tablas de imágenes.')
    .replace(/格式补写：补写 (\d+) 处。/g, 'Formato: se completaron $1 espacios. ')
    .replace(/格式补写：补写 (\d+) 处/g, 'Formato: se completaron $1 espacios')
    .replace(/，(\d+) 处未补写——/g, '; quedaron $1 sin completar: ')
    .replace(/第(\d+)页第(\d+)栏约([\d.]+)cm/g, 'página $1, columna $2: aproximadamente $3 cm')
    .replace(/全局事实变量整理完成：(\d+) 个大项。/g, 'Datos generales preparados: $1 grupos.')
    .replace(/已按技术分支结构将 AI 生成叶子目标从 (\d+) 调整为 (\d+)/g, 'La cantidad prevista de secciones de IA se ajustó de $1 a $2 según la estructura técnica.')
    .replace(/投标模版：/g, 'Plantilla de oferta: ')
    .replace(/模型请求遇到临时错误，(\d+) 秒后进行第 (\d+)\/(\d+) 次重试：/g, 'Error temporal del modelo; reintento $2/$3 en $1 s: ')
    .replace(/模型请求已恢复，第 (\d+) 次重试成功/g, 'La solicitud al modelo se recuperó en el intento $1')
    .replace(/模型请求重试 (\d+) 次后仍失败/g, 'La solicitud al modelo falló después de $1 reintentos');
  return SPANISH_ORDERED.reduce((result, [source, target]) => result.replaceAll(source, target), translated);
}
