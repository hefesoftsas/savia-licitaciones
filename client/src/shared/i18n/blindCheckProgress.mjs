// These names identify built-in document-checking rules, not document text.
export const blindCheckRuleNames = {
  '上下标':'superíndices y subíndices', '下划线':'subrayado', '中文字体':'fuente para texto chino', '全角字母':'letras de ancho completo', '全角数字':'dígitos de ancho completo', '分栏':'columnas', '制表符':'tabuladores', '加粗':'negrita', '半角括号':'paréntesis de ancho medio', '单元格底纹':'sombreado de celdas', '各节页面设置一致':'configuración de página entre secciones', '合并单元格':'celdas combinadas', '同级标题格式一致性':'formato de títulos del mismo nivel', '命名书签':'marcadores con nombre', '图片元数据':'metadatos de imágenes', '域代码':'códigos de campo', '多余空格':'espacios sobrantes', '字体缩放':'escala de fuente', '字号':'tamaño de fuente', '字符间距':'espaciado entre caracteres', '对齐到网格':'alineación a la cuadrícula', '嵌套表格':'tablas anidadas', '异常字体效果':'efectos de fuente', '彩色图片':'imágenes en color', '彩色图表和图形':'gráficos en color', '手动换行':'saltos manuales', '批注':'comentarios', '敏感信息/身份泄露':'información sensible e identidad', '文字颜色':'color del texto', '文本框':'cuadros de texto', '文档属性':'propiedades del documento', '斜体':'cursiva', '未接受的修订':'cambios sin aceptar', '标题内容异常':'contenido de títulos', '标题层级跳跃':'saltos de nivel en títulos', '标题序号格式':'formato de numeración de títulos', '标题编号连续性':'continuidad de la numeración de títulos', '正文格式一致性':'uniformidad del formato del texto', '正文页码文字与缺少页码':'referencias y ausencia de números de página', '段内字体混用':'mezcla de fuentes en un párrafo', '段前分页':'salto de página antes del párrafo', '段前段后间距':'espacio antes y después del párrafo', '段落对齐方式':'alineación de párrafos', '特殊字符':'caracteres especiales', '目录':'índice', '矢量图中的文字':'texto en gráficos vectoriales', '空段落':'párrafos vacíos', '突出显示和文字底纹':'resaltado y sombreado del texto', '纸张大小':'tamaño de papel', '纸张方向':'orientación del papel', '英文标点':'puntuación latina', '行距':'interlineado', '表格字体':'fuente de tablas', '表格字号':'tamaño de letra en tablas', '表格对齐方式':'alineación de tablas', '表格样式':'estilo de tablas', '表格首行缩进':'sangría de la primera línea en tablas', '西文字体':'fuente occidental', '超链接':'hipervínculos', '隐藏文字':'texto oculto', '页眉页脚内容':'contenido del encabezado y pie', '页边距':'márgenes', '页面背景色':'color de fondo de página', '首行缩进':'sangría de la primera línea',
};

export function localizeBlindCheckProgress(text, language) {
  if (language !== 'es') return text;
  const fixed = {
    '检查失败。': 'Falló la revisión.',
    '修复失败。': 'Falló la corrección.',
    'AI 正在复核（当前预设没有保存招标文件原文，只能依据预设条款），通常需要几分钟。': 'La IA está revisando las cláusulas configuradas; no se guardó el texto original del pliego. Puede tardar unos minutos.',
    'AI 正在处理程序修不了的问题，通常需要几分钟。': 'La IA está tratando los problemas que la corrección automática no pudo resolver; puede tardar unos minutos.',
    '本次选择仅程序修复': 'Se eligió únicamente la corrección automática.',
    'AI 复核失败，本次只做了程序修复': 'Falló la revisión con IA; solo se realizó la corrección automática.',
    'AI 复核尚未完成，本次只做了程序修复': 'La revisión con IA no había terminado; solo se realizó la corrección automática.',
    'AI 复核会话已失效，请重新检查后再修复': 'La sesión de revisión con IA venció; vuelve a revisar antes de corregir.',
    '没有勾选程序修复项': 'No se seleccionaron correcciones automáticas.',
    '暗标自动修复失败': 'Falló la corrección automática de la oferta anónima.',
    '暗标合规检查失败': 'Falló la revisión de la oferta anónima.',
    'AI 复核失败': 'Falló la revisión con IA.',
    'AI 修复失败': 'Falló la corrección con IA.',
  };
  if (fixed[text]) return fixed[text];
  const patterns = [
    [/^开始检查「(.+?)」，格式预设：(.+)。$/, (_, file, preset) => `Iniciando la revisión de «${file}» con el formato «${preset}».`],
    [/^正在检查图片颜色（(\d+)\/(\d+)）$/, (_, done, total) => `Revisando el color de las imágenes (${done}/${total}).`],
    [/^开始修复「(.+?)」，本次修复范围共 (\d+) 处问题。$/, (_, file, count) => `Iniciando la corrección de «${file}»: ${count} problemas incluidos.`],
    [/^正在把 (\d+) 张彩色图片转为灰度$/, (_, count) => `Convirtiendo ${count} imágenes de color a escala de grises.`],
    [/^程序修复完成：共修改 (\d+) 处。$/, (_, count) => `Corrección automática terminada: ${count} cambios.`],
    [/^AI 正在对照「(.+?)」复核，通常需要几分钟。$/, (_, file) => `La IA está revisando el documento frente a «${file}»; puede tardar unos minutos.`],
    [/^AI 复核完成：对照招标条款 (\d+) 条（不符合 (\d+) 条），补充问题 (\d+) 个(?:，判定候选问题 (\d+) 项)?。$/, (_, total, failed, issues, candidates) => `Revisión con IA terminada: ${total} cláusulas revisadas (${failed} incumplidas), ${issues} problemas adicionales${candidates ? ` y ${candidates} posibles problemas evaluados` : ''}.`],
    [/^修复完成：已修复 (\d+) 处，待人工处理 (\d+) 处。$/, (_, fixedCount, pending) => `Corrección terminada: ${fixedCount} problemas corregidos y ${pending} pendientes de revisión manual.`],
    [/^修复完成：已修复 (\d+) 处，待人工处理 (\d+) 处（自动修复未完成：(.+)）。$/, (_, fixedCount, pending, reason) => `Corrección terminada: ${fixedCount} problemas corregidos y ${pending} pendientes de revisión manual (corrección automática incompleta: ${(fixed[reason] || reason).replace(/\.$/, '')}).`],
    [/^AI 复核失败：(.+)$/, (_, detail) => `Falló la revisión con IA: ${detail}`],
    [/^AI 处理：(.+)$/, (_, detail) => `Resultado de la IA: ${detail}`],
  ];
  for (const [pattern, replace] of patterns) {
    if (pattern.test(text)) return text.replace(pattern, replace);
  }
  const match = /^(正在检查|正在修复)：(.+)$/.exec(text);
  if (!match || !blindCheckRuleNames[match[2]]) return text;
  return `${match[1] === '正在检查' ? 'Revisando' : 'Corrigiendo'}: ${blindCheckRuleNames[match[2]]}`;
}
