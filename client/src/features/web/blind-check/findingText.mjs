const pageMessages = {
  '存在横向页面':'Hay páginas en orientación horizontal',
  '存在分栏排版':'Hay páginas con varias columnas',
  '页面设置了背景颜色':'La página tiene un color de fondo',
  '页面设置与第 1 节不同':'La configuración de página difiere de la sección 1',
  '上边距不符合要求':'El margen superior no cumple el requisito',
  '下边距不符合要求':'El margen inferior no cumple el requisito',
  '左边距不符合要求':'El margen izquierdo no cumple el requisito',
  '右边距不符合要求':'El margen derecho no cumple el requisito',
  '布局 → 页边距 → 自定义页边距':'Diseño → Márgenes → Márgenes personalizados',
  '布局 → 栏 → 一栏':'Diseño → Columnas → Una columna',
  '设计 → 页面颜色 → 无颜色':'Diseño → Color de página → Sin color',
  '确认招标文件是否允许横向页；不允许时在「布局 → 纸张方向」改为纵向':'Comprueba si el pliego permite páginas horizontales; si no, cambia la orientación a vertical en Diseño → Orientación.',
  '确认该节是否需要单独的页面设置（如横向附图）；不需要时在「布局 → 页面设置」中与第 1 节保持一致':'Comprueba si la sección necesita una configuración distinta, por ejemplo para un plano horizontal; si no, usa la misma configuración que en la sección 1.',
  '全文':'Todo el documento',
  '中文字体无法确定':'No se pudo determinar la fuente del texto chino',
  '该文字未设置中文字体，样式和主题中也找不到，打开时可能被替代字体显示':'El texto no tiene una fuente china definida en su formato, estilo o tema; podría mostrarse con una fuente sustituta.',
  '字号无法确定':'No se pudo determinar el tamaño de la letra',
  '该文字未设置字号，样式中也找不到':'El tamaño de la letra no está definido en el texto ni en el estilo.',
  '标题未加粗':'El título no está en negrita', '标题不应加粗':'El título no debe estar en negrita',
  '表格文字使用了加粗':'El texto de la tabla está en negrita', '格式要求表格文字不加粗':'El formato exige que el texto de la tabla no use negrita.',
  '正文使用了加粗':'El texto principal está en negrita', '格式要求正文不加粗':'El formato exige que el texto principal no use negrita.',
  '选中标题文字 → 加粗（Ctrl+B）':'Selecciona el título y aplica negrita (Ctrl+B).',
  '选中标题文字 → 取消加粗（Ctrl+B）':'Selecciona el título y quita la negrita (Ctrl+B).',
  '选中表格文字 → 取消加粗（Ctrl+B）':'Selecciona el texto de la tabla y quita la negrita (Ctrl+B).',
  '选中文字 → 取消加粗（Ctrl+B）':'Selecciona el texto y quita la negrita (Ctrl+B).',
  '文字使用了斜体':'El texto está en cursiva', '暗标通常要求统一不使用斜体':'La oferta anónima normalmente requiere no usar cursiva.',
  '选中文字 → 取消倾斜（Ctrl+I）':'Selecciona el texto y quita la cursiva (Ctrl+I).',
  '文字带下划线':'El texto está subrayado', '选中文字 → 取消下划线（Ctrl+U）':'Selecciona el texto y quita el subrayado (Ctrl+U).',
  '文字不是黑色':'El texto no es negro', '选中文字 → 字体颜色 → 自动':'Selecciona el texto → Color de fuente → Automático.',
  '文字带突出显示（高亮）':'El texto está resaltado', '选中文字 → 文本突出显示颜色 → 无颜色':'Selecciona el texto → Color de resaltado → Sin color.',
  '文字带底纹':'El texto tiene sombreado', '选中文字 → 边框和底纹 → 底纹 → 填充选「无颜色」':'Selecciona el texto → Bordes y sombreado → Sombreado → Sin color.',
  '存在隐藏文字':'Hay texto oculto', '隐藏文字平时看不到，但可能残留企业信息，提交后可被读取':'El texto oculto puede contener información de la empresa y ser legible después de presentar el documento.',
  '选中文字 → 字体 → 效果 → 取消「隐藏」':'Selecciona el texto → Fuente → Efectos → desactiva «Oculto».',
  '段落对齐方式不符合要求':'La alineación del párrafo no cumple el requisito',
  '行距类型不符合要求':'El tipo de interlineado no cumple el requisito',
  '行距倍数不符合要求':'El interlineado múltiple no cumple el requisito',
  '行距数值不符合要求':'El valor del interlineado no cumple el requisito',
  '首行缩进不符合要求':'La sangría de la primera línea no cumple el requisito',
  '段前间距为自动':'El espaciado anterior al párrafo está en automático',
  '段后间距为自动':'El espaciado posterior al párrafo está en automático',
  '段前间距不符合要求':'El espaciado anterior al párrafo no cumple el requisito',
  '段后间距不符合要求':'El espaciado posterior al párrafo no cumple el requisito',
  '段落设置了「段前分页」':'El párrafo tiene un salto de página anterior',
  '该段前被强制换页，会造成版面留白，请确认是否必要':'El salto forzado antes del párrafo puede dejar espacio en blanco; comprueba si es necesario.',
  '开始 → 段落 → 对齐方式':'Inicio → Párrafo → Alineación',
  '开始 → 段落 → 行距 → 多倍行距':'Inicio → Párrafo → Interlineado → Múltiple',
  '开始 → 段落 → 间距 → 段前':'Inicio → Párrafo → Espaciado → Antes',
  '开始 → 段落 → 间距 → 段后':'Inicio → Párrafo → Espaciado → Después',
  '开始 → 段落 → 换行和分页 → 取消「段前分页」':'Inicio → Párrafo → Líneas y saltos de página → desactiva «Salto de página anterior».',
  '表格内段落首行缩进不符合要求':'La sangría de primera línea en la tabla no cumple el requisito',
  '表格对齐方式不符合要求':'La alineación de la tabla no cumple el requisito',
  '表格套用了带格式的表格样式':'La tabla usa un estilo con formato',
  '单元格存在彩色底纹':'Hay celdas con sombreado de color',
  '存在嵌套表格':'Hay tablas anidadas', '表格':'Tabla',
  '选中表格 → 段落 → 特殊 → 无':'Selecciona la tabla → Párrafo → Especial → Ninguna.',
  '选中表格 → 表格属性 → 表格 → 对齐方式':'Selecciona la tabla → Propiedades de tabla → Tabla → Alineación.',
  '选中单元格 → 表设计 → 底纹 → 无颜色':'Selecciona las celdas → Diseño de tabla → Sombreado → Sin color.',
  '把嵌套表格拆出或合并到外层表格':'Separa las tablas anidadas o intégralas en la tabla exterior.',
  '选中表格 → 表设计 → 表格样式选择「网格型」或清除样式':'Selecciona la tabla → Diseño de tabla → Estilos de tabla; elige un estilo de cuadrícula o borra el estilo.',
  '该词来自资信库中的本单位信息，出现即可能暴露投标人身份':'El término procede de la información de la empresa en la biblioteca de credenciales y podría revelar la identidad del oferente.',
  '命中预设中的自定义敏感词，出现即可能暴露投标人身份':'Coincide con un término sensible configurado y podría revelar la identidad del oferente.',
  '自称会让评审方识别出投标单位，暗标要求全文匿名，通常改为「投标人」':'La referencia a la propia empresa podría identificar al oferente; cuando se exige anonimato suele sustituirse por «el oferente».',
  '这是表单字段名，若已填写具体信息即构成泄露；若是空白表格可保留，请人工确认':'Es una etiqueta de formulario: si contiene datos podría revelar la identidad. Si está vacía, podría mantenerse; revísala manualmente.',
  '文中出现完整企业名称，属于可直接识别投标单位的文字':'Aparece el nombre completo de una empresa y podría identificar directamente al oferente.',
  '联系方式属于可识别身份的信息':'Los datos de contacto pueden identificar a una persona o empresa.',
  '身份证号属于个人敏感信息':'El número de identificación es información personal sensible.',
  '统一社会信用代码可直接反查企业':'El código de crédito social puede identificar a una empresa.',
  '邮箱地址可能包含企业域名':'La dirección de correo puede contener el dominio de una empresa.',
  '网址可能指向企业官网，属于可识别身份的信息':'La dirección web podría apuntar a la página de la empresa y revelar su identidad.',
  '连续长数字串疑似银行账号，请人工确认':'Una secuencia larga de dígitos podría ser una cuenta bancaria; compruébala manualmente.',
  '模板占位符未替换，可能被视为未响应招标文件':'Hay un marcador de plantilla sin reemplazar que podría indicar una respuesta incompleta al pliego.',
  '命中预设中的自定义规则':'Coincide con una regla personalizada de la configuración.',
  '替换为「投标人」或删除，同时检查页眉页脚、图片和文档属性':'Si procede, sustituye por «el oferente» o elimina el dato; revisa también encabezados, pies, imágenes y propiedades del documento.',
  '确认该字段是否已填写实际信息；空白表格可忽略，否则删除或留空':'Comprueba si el campo contiene información real; si está vacío puede ignorarse; de lo contrario, elimínalo o déjalo vacío.',
  '删除网址，或取消超链接后删除':'Elimina la dirección web o quita primero el hipervínculo y después la dirección.',
  '按招标文件要求填写实际内容':'Completa el contenido según los requisitos del pliego.',
  '删除该信息，或替换为通用表述':'Elimina la información o sustitúyela por una descripción genérica.',
  '存在手动换行符':'Hay saltos de línea manuales',
  '在该位置按回车分成两段':'Pulsa Intro en esa posición para separar los párrafos.',
  '把手动换行改为段落回车（查找替换：^l 替换为 ^p）':'Sustituye los saltos manuales por saltos de párrafo: en Buscar y reemplazar, cambia ^l por ^p.',
  '文本中使用了制表符（Tab）':'El texto contiene tabuladores',
  '删除制表符，改用段落缩进对齐':'Elimina los tabuladores y usa la sangría de párrafo para alinear.',
  '多余空格会造成排版不齐，也可能被视为标记':'Los espacios sobrantes pueden causar una alineación irregular o interpretarse como marcas.',
  '删除行首行尾空格以及中文之间的空格，缩进请用段落格式设置':'Elimina los espacios al inicio y final de línea y entre caracteres chinos; usa el formato de párrafo para la sangría.',
  '这些字符肉眼不可见，会导致格式异常，也可能被用作标记':'Estos caracteres no son visibles y pueden causar problemas de formato o interpretarse como marcas.',
  '用查找替换清除这些字符':'Usa Buscar y reemplazar para eliminar estos caracteres.',
  '中文内容中使用了半角括号':'Se usan paréntesis de ancho medio junto a texto chino',
  '把中文语境里的 ( ) 替换为（）':'Sustituye los paréntesis ( ) junto a texto chino por （）.',
  '把中文语境里的 , . ; : ? ! 替换为 ，。；：？！':'En el texto chino, sustituye , . ; : ? ! por ，。；：？！.',
  '把全角数字 ０-９ 替换为半角数字 0-9':'Sustituye los dígitos de ancho completo ０-９ por 0-9.',
  '把全角字母替换为半角字母（开始 → 更改大小写 → 半角）':'Sustituye las letras de ancho completo por letras de ancho medio.',
  '存在未接受的修订':'Hay cambios de revisión sin aceptar',
  '审阅 → 接受 → 接受所有修订，并关闭「修订」':'Revisar → Aceptar → Aceptar todos los cambios; después desactiva el control de cambios.',
  '文档残留批注':'El documento contiene comentarios',
  '审阅 → 删除 → 删除文档中的所有批注':'Revisar → Eliminar → Eliminar todos los comentarios del documento.',
  '单元格内存在多余空段落':'Hay párrafos vacíos sobrantes en una celda',
  '删除多余空行，保留一个':'Elimina las líneas vacías sobrantes y conserva una.',
  '存在含分页符的空段落':'Hay un párrafo vacío con salto de página',
  '存在设置段前分页的空段落':'Hay un párrafo vacío con salto de página anterior',
  '该空段落用分页符强制换页，会多占一行；要求每页固定行数时会不符':'El párrafo vacío fuerza un salto de página y ocupa una línea adicional, lo que puede incumplir un número fijo de líneas por página.',
  '该空段落靠「段前分页」让后文另起一页，会多占一行；要求每页固定行数时会不符':'El párrafo vacío fuerza una página nueva y ocupa una línea adicional, lo que puede incumplir un número fijo de líneas por página.',
  '可删除本段，改为在下一段设置「段前分页」':'Puedes eliminar el párrafo y configurar un salto de página anterior en el párrafo siguiente.',
  '存在空段落':'Hay un párrafo vacío',
  '空段落会造成多余空行，要求每页固定行数时会导致版面不符':'Un párrafo vacío añade una línea y puede incumplir un número fijo de líneas por página.',
  '删除该空行':'Elimina la línea vacía.',
  '页脚中没有页码':'El pie de página no tiene número de página',
  '招标文件要求页脚出现页码，文档的页脚里没有页码域':'El pliego exige un número de página en el pie, pero no se encontró un campo de numeración.',
  '插入 → 页码 → 页面底端，按招标文件要求的格式插入页码':'Insertar → Número de página → Final de página; usa el formato exigido por el pliego.',
  '正文中出现页码文字':'Hay texto de número de página en el cuerpo del documento',
  '删除该行':'Elimina esa línea.',
  '文档包含目录':'El documento contiene un índice', '文档包含空的目录域':'El documento contiene un campo de índice vacío',
  '未检测到目录':'No se detectó un índice', '招标文件要求提供目录时需补充':'Añade un índice si el pliego lo exige.',
  '引用 → 目录 → 自动目录':'Referencias → Tabla de contenido → Tabla automática.',
  '目录疑似手工录入':'El índice parece escrito manualmente',
  '手工目录不会随正文标题自动更新，容易与实际标题不一致':'Un índice manual no se actualiza automáticamente y puede no coincidir con los títulos.',
  '建议用「引用 → 目录」自动生成':'Se recomienda generarlo desde Referencias → Tabla de contenido.',
  '标题序号不是阿拉伯数字':'La numeración del título no usa números arábigos',
  '标题没有序号':'El título no tiene numeración',
  '标题序号级数与标题级别不符':'La numeración no coincide con el nivel del título',
  '文档中存在文本框':'El documento contiene cuadros de texto',
  '确认是否必要，必要时把文本框内容转为正文':'Comprueba si son necesarios; si corresponde, pasa su contenido al cuerpo del documento.',
  '书签名称含有身份信息':'El nombre de un marcador contiene información de identidad',
  '文档含命名书签':'El documento contiene marcadores con nombre',
  '插入 → 书签，删除无关书签':'Insertar → Marcador; elimina los marcadores que no correspondan.',
  '存在外部超链接':'Hay un hipervínculo externo',
  '存在可能泄露身份的域代码':'Hay códigos de campo que podrían revelar la identidad',
  '按 Alt+F9 显示域代码，删除这些域，或选中后按 Ctrl+Shift+F9 转为普通文字':'Pulsa Alt+F9 para mostrar los códigos de campo; elimínalos o usa Ctrl+Mayús+F9 para convertirlos en texto.',
  '文档属性中残留模板名称':'Las propiedades contienen un nombre de plantilla',
  '文档含自定义属性':'El documento contiene propiedades personalizadas',
  '文件 → 信息 → 属性 → 高级属性 → 自定义，删除无关属性':'Archivo → Información → Propiedades → Propiedades avanzadas → Personalizar; elimina las propiedades que no correspondan.',
  '存在彩色图片':'Hay una imagen en color',
  '按招标文件要求把图片转为黑白或灰度后重新插入':'Si el pliego lo exige, convierte la imagen a blanco y negro o escala de grises y vuelve a insertarla.',
  '图表使用了彩色':'El gráfico utiliza color',
  '选中图表 → 图表设计 → 更改颜色，选单色（灰色）方案，或把各系列改为黑白灰':'Selecciona el gráfico → Diseño de gráfico → Cambiar colores; elige una escala de grises o configura las series en blanco, negro y gris.',
  'SmartArt 图形使用了彩色':'El gráfico SmartArt utiliza color',
  '选中 SmartArt → SmartArt 设计 → 更改颜色，选黑白或灰度方案':'Selecciona SmartArt → Diseño de SmartArt → Cambiar colores; elige blanco y negro o escala de grises.',
  '形状或文本框使用了彩色':'La forma o el cuadro de texto utiliza color',
  '选中形状 → 形状格式 → 把填充和轮廓改为黑白灰或无':'Selecciona la forma → Formato de forma; cambia el relleno y el contorno a blanco, negro, gris o sin color.',
  '矢量图无法自动判断是否为彩色':'No se pudo determinar automáticamente si la imagen vectorial tiene color',
  '打开图片确认是否为黑白；是彩色时在绘图软件中改为黑白后重新插入':'Comprueba si la imagen es en blanco y negro; si tiene color y el pliego lo exige, conviértela en un editor y vuelve a insertarla.',
  '矢量图中含有身份信息':'La imagen vectorial contiene información de identidad',
  '矢量图中含有文字，请人工确认':'La imagen vectorial contiene texto; revísalo manualmente',
  '在原始绘图软件中删除图框、标注里的单位名称等信息后重新导出插入，或改为不含文字的图片':'Si corresponde, elimina los datos de identidad del gráfico en el editor original y vuelve a exportarlo, o usa una imagen sin texto.',
  '双击图片或在原始绘图软件中检查图中文字':'Abre la imagen o el editor original y revisa su texto.',
  '图片元数据中含有身份信息':'Los metadatos de la imagen contienen información de identidad',
  '图片元数据含作者、版权等信息，请人工确认':'Los metadatos de la imagen incluyen autor, derechos u otra información; revísalos manualmente',
  '用画图等软件另存图片（或在文件属性 → 详细信息中删除属性和个人信息）后重新插入':'Guarda una copia de la imagen en un editor, o elimina propiedades y datos personales en Propiedades → Detalles, y vuelve a insertarla.',
  '图片含拍摄位置（GPS）信息':'La imagen contiene información de ubicación GPS',
  '在文件属性 → 详细信息中删除属性和个人信息，或另存后重新插入':'Elimina las propiedades y datos personales en Propiedades → Detalles, o guarda una copia y vuelve a insertarla.',
  '标题编号重复':'La numeración de títulos está repetida',
  '核对标题编号是否重复；建议改用 Word 多级列表自动编号':'Comprueba la numeración; se recomienda usar una lista multinivel automática de Word.',
  '标题编号不连续':'La numeración de títulos no es consecutiva',
  '核对是否遗漏章节或编号写错；建议改用 Word 多级列表自动编号':'Comprueba si falta un apartado o si hay un error de numeración; se recomienda una lista multinivel automática de Word.',
  '标题层级跳跃':'Hay un salto de nivel entre títulos',
  '检查标题样式或大纲级别是否设错，必要时补齐中间层级':'Revisa el estilo o nivel de esquema de los títulos y añade el nivel intermedio si hace falta.',
  '标题只有编号没有文字':'El título tiene número pero no texto',
  '补全标题文字，或取消该段的标题样式':'Completa el título o quita el estilo de título del párrafo.',
  '标题文字过长':'El título es demasiado largo',
  '确认该段是否为标题；正文段落请改用正文样式':'Comprueba si el párrafo es un título; si es texto principal, cambia su estilo.',
  '正文中文字体与多数段落不一致':'La fuente china del texto difiere de la mayoría de los párrafos',
  '正文字号与多数段落不一致':'El tamaño del texto difiere de la mayoría de los párrafos',
  '正文对齐方式与多数段落不一致':'La alineación difiere de la mayoría de los párrafos',
  '确认是否为图表标题等特殊段落；不是时与正文统一对齐方式':'Comprueba si es un párrafo especial, como el título de un gráfico; si no, unifica su alineación.',
  '段内混用多种中文字体':'El párrafo mezcla varias fuentes chinas',
  '选中整段，统一设置中文字体':'Selecciona el párrafo completo y usa una sola fuente china.',
  '对同级标题统一使用同一个标题样式，或用格式刷与同级标题保持一致':'Usa el mismo estilo para los títulos del mismo nivel o copia su formato.',
  '存在字符间距调整':'Se ha ajustado el espaciado entre caracteres',
  '选中文字 → 字体 → 高级 → 间距：标准':'Selecciona el texto → Fuente → Avanzado → Espaciado: normal.',
  '存在字体缩放':'Se ha ajustado la escala de la fuente',
  '选中文字 → 字体 → 高级 → 缩放：100%':'Selecciona el texto → Fuente → Avanzado → Escala: 100%.',
  '存在上标或下标文字':'Hay texto en superíndice o subíndice',
  '确认上下标是否必要（如单位 m³ 可保留）；不需要时选中文字取消上标或下标':'Comprueba si el superíndice o subíndice es necesario, por ejemplo en m³; si no, selecciónalo y quita el formato.',
  '段落对齐到文档网格，实际行距可能被放大':'El párrafo está alineado a la cuadrícula y el interlineado podría aumentar',
  '开始 → 段落 → 取消勾选「如果定义了文档网格，则对齐到网格」，或改用固定值行距':'Inicio → Párrafo → desactiva la alineación a la cuadrícula del documento o usa interlineado fijo.',
  '文档属性中残留「单位」':'Las propiedades del documento contienen una organización',
  '表格含合并单元格':'La tabla contiene celdas combinadas',
  '人工确认合并后的表格在评审系统中显示正常；必要时拆分单元格':'Comprueba manualmente que la tabla se muestre bien en el sistema de evaluación; separa las celdas si hace falta.',
  '文档中有一个尚未更新的空目录域，当前不显示内容，但更新域（F9）后会生成目录':'El documento tiene un campo de índice vacío; al actualizarlo con F9 se generará el índice.',
  '确认招标文件要求；如不允许，删除目录或目录域（可在 Alt+F9 显示域代码后删除）':'Verifica el pliego; si no permite un índice, elimina el índice o su campo. Puedes mostrar los códigos con Alt+F9.',
  '这些效果在暗标中通常被视为标记行为':'Estos efectos pueden interpretarse como marcas en una oferta anónima.',
  '选中文字 → 字体 → 效果，全部取消':'Selecciona el texto → Fuente → Efectos; desactiva los efectos.',
  '文件 → 信息 → 检查问题 → 检查文档，删除「文档属性和个人信息」':'Archivo → Información → Comprobar si hay problemas → Inspeccionar documento; elimina propiedades y datos personales si corresponde.',
};
const alignmentNames = { '左对齐':'alineado a la izquierda', '左对齐（未设置）':'alineado a la izquierda (sin configurar)', '居中':'centrado', '右对齐':'alineado a la derecha', '两端对齐':'justificado', '分散对齐':'distribuido' };
const textRuleNames = { '行首空格':'espacio al inicio', '行尾空格':'espacio al final', '全角空格':'espacio de ancho completo', '中文字符间空格':'espacio entre caracteres chinos', '中文与标点间空格':'espacio entre texto chino y puntuación', '标点与中文间空格':'espacio entre puntuación y texto chino', '中文与数字间空格':'espacio entre texto chino y dígitos', '数字与中文间空格':'espacio entre dígitos y texto chino', '行分隔符':'separador de línea', '段分隔符':'separador de párrafo', '零宽空格':'espacio de ancho cero', '零宽非连接符':'no conector de ancho cero', '零宽连接符':'conector de ancho cero', '零宽不换行空格':'espacio de ancho cero sin salto', '不换行空格':'espacio sin salto' };
const fontEffects = { '删除线':'tachado', '双删除线':'doble tachado', '全部大写':'mayúsculas', '小型大写':'versalitas', '阳文':'relieve', '阴文':'grabado', '空心':'contorno', '阴影':'sombra' };
function localizeFormatValue(value) {
  if (alignmentNames[value]) return alignmentNames[value];
  if (value === '单倍行距（未设置）') return 'interlineado sencillo (sin configurar)';
  const points = /^(固定值|最小值) ([\d.]+) 磅$/.exec(value);
  if (points) return `${points[2]} pt (${points[1] === '固定值' ? 'fijo' : 'mínimo'})`;
  const multiple = /^([\d.]+) 倍行距$/.exec(value);
  return multiple ? `interlineado ${multiple[1]} veces` : value;
}
function localizeImageFields(value) {
  const labels = { '作者':'Autor', '版权':'Derechos', '描述':'Descripción', '标题':'Título', '备注':'Nota', '主题':'Asunto', '来源':'Fuente', '声明':'Declaración' };
  return value.replace(/(^|；)(作者|版权|描述|标题|备注|主题|来源|声明)：/g, (_match, prefix, key) => `${prefix}${labels[key]}: `);
}
function localizeColorValue(value) {
  return value.replace(/^主题色 (.+)（(#\w+)）$/, 'color del tema $1 ($2)').replace(/^主题色 (.+)$/, 'color del tema $1');
}
function localizeSectionDifferences(value) {
  const names = { '纸张':'Papel', '上边距':'Margen superior', '下边距':'Margen inferior', '左边距':'Margen izquierdo', '右边距':'Margen derecho', '分栏':'Columnas' };
  const parts = value.split('；');
  const pattern = /^(纸张|上边距|下边距|左边距|右边距|分栏) ((?:[\d.]+|未设置)(?:×(?:[\d.]+|未设置))? cm|\d+ 栏)（第 1 节为 ((?:[\d.]+|未设置)(?:×(?:[\d.]+|未设置))? cm|\d+ 栏)）$/;
  if (!parts.every((part) => pattern.test(part))) return value;
  const display = (text) => text.replaceAll('未设置', 'sin configurar').replace(/(\d+) 栏/g, (_match, count) => `${count} ${count === '1' ? 'columna' : 'columnas'}`);
  return parts.map((part) => { const [, key, current, reference] = pattern.exec(part); return `${names[key]}: ${display(current)} (sección 1: ${display(reference)})`; }).join('; ');
}
function localizeHeadingDifferences(value) {
  const labels = { '中文字体':'Fuente china', '字号':'Tamaño', '加粗':'Negrita', '对齐方式':'Alineación', '首行缩进':'Sangría de primera línea' };
  const pattern = /^(中文字体|字号|加粗|对齐方式|首行缩进)为「([^」]+)」，同级多数为「([^」]+)」（(\d+%)）$/;
  const parts = value.split('；');
  if (!parts.every((part) => pattern.test(part))) return value;
  const show = (key, text) => {
    if (key === '中文字体') return text;
    if (key === '加粗') return text === '加粗' ? 'negrita' : text === '不加粗' ? 'sin negrita' : text;
    if (key === '对齐方式') return localizeFormatValue(text);
    if (key === '首行缩进') return text.replace(/^([\d.]+) 字符$/, '$1 caracteres');
    return text.replace(/^(?:[\p{Script=Han}]+（)?([\d.]+)磅(?:）)?$/u, '$1 pt');
  };
  return parts.map((part) => { const [, key, current, majority, percentage] = pattern.exec(part); return `${labels[key]}: «${show(key, current)}»; mayoría del mismo nivel: «${show(key, majority)}» (${percentage})`; }).join('; ');
}

export function localizeFindingLocation(value, language) {
  if (language === 'en' && value) return value.replace(/^第 (\d+) 节(?= · |$)/, 'Section $1').replace(/^第 (\d+) 个表格(?= · |$)/, 'Table $1');
  if (language !== 'es' || !value) return value;
  const [location, ...context] = value.split(' · ');
  const parts = { '目录':'Índice', '封面':'Portada', '脚注':'Nota al pie', '尾注':'Nota final', '文本框':'Cuadro de texto', '全文':'Todo el documento', '表格':'Tabla', '批注':'Comentario', '正文':'Texto principal', '书签':'Marcador', '文档属性':'Propiedades del documento' };
  let translated = parts[location] || location;
  translated = translated.replace(/^正文第 (\d+) 段$/, 'Párrafo $1 del texto principal')
    .replace(/^第 (\d+) 个表格 第 (\d+) 行第 (\d+) 列$/, 'Tabla $1, fila $2, columna $3')
    .replace(/^第 (\d+) 个表格$/, 'Tabla $1')
    .replace(/^第 (\d+) 节$/, 'Sección $1')
    .replace(/^(?:第 (\d+) 节)?(页眉|页脚)(（首页）|（偶数页）)?$/, (_match, section, kind, variant) => `${kind === '页眉' ? 'Encabezado' : 'Pie de página'}${section ? ` de la sección ${section}` : ''}${variant === '（首页）' ? ' (primera página)' : variant === '（偶数页）' ? ' (páginas pares)' : ''}`);
  return [translated, ...context].join(' · ');
}

export function localizeFindingNote(value, language, category) {
  if (language === 'en' && value) {
    const origins = { '直接格式':'direct formatting', '字符样式':'character style', '段落样式':'paragraph style', '表格样式':'table style', '文档默认格式':'document defaults' };
    if (value.startsWith('格式来自：') && origins[value.slice(5)]) return `Formatting source: ${origins[value.slice(5)]}`;
    return localizeFindingText(value, language, category);
  }
  if (language !== 'es' || !value) return value;
  if (value === '位置未核实：摘录在该段找不到，请人工核对') return 'Ubicación sin verificar: no se encontró el fragmento en ese párrafo; revísalo manualmente.';
  if (value === '全文性质的问题，不对应具体段落') return 'Hallazgo del documento completo; no corresponde a un párrafo concreto.';
  if (value.startsWith('需人工确认：')) return `Requiere revisión manual: ${value.slice('需人工确认：'.length)}`;
  if (value.startsWith('修改方法：')) return `Cómo corregir: ${localizeFindingText(value.slice('修改方法：'.length), language, category)}`;
  if (value.startsWith('格式来自：')) {
    const origin = value.slice('格式来自：'.length);
    const names = { '直接格式':'formato directo', '字符样式':'estilo de caracteres', '段落样式':'estilo de párrafo', '表格样式':'estilo de tabla', '文档默认格式':'formato predeterminado del documento' };
    const named = /^段落样式「(.+)」$/.exec(origin);
    return `Origen del formato: ${named ? `estilo de párrafo «${named[1]}»` : (names[origin] || origin)}`;
  }
  return localizeFindingText(value, language, category);
}

const ruleTitles = {
  '上下标': { es: 'Superíndices y subíndices', en: 'Superscript and subscript' },
  '下划线': { es: 'Subrayado', en: 'Underline' },
  '中文字体': { es: 'Fuente china', en: 'Chinese font' },
  '全角字母': { es: 'Letras de ancho completo', en: 'Full-width letters' },
  '全角数字': { es: 'Números de ancho completo', en: 'Full-width digits' },
  '分栏': { es: 'Columnas', en: 'Columns' },
  '制表符': { es: 'Tabuladores', en: 'Tabs' },
  '加粗': { es: 'Negrita', en: 'Bold' },
  '半角括号': { es: 'Paréntesis de ancho medio', en: 'Half-width brackets' },
  '单元格底纹': { es: 'Sombreado de celdas', en: 'Cell shading' },
  '各节页面设置一致': { es: 'Consistencia de configuración por sección', en: 'Section page setup consistency' },
  '合并单元格': { es: 'Celdas combinadas', en: 'Merged cells' },
  '同级标题格式一致性': { es: 'Consistencia de formato en títulos', en: 'Heading format consistency' },
  '命名书签': { es: 'Marcadores con nombre', en: 'Named bookmarks' },
  '图片元数据': { es: 'Metadatos de imágenes', en: 'Image metadata' },
  '域代码': { es: 'Códigos de campo', en: 'Field codes' },
  '多余空格': { es: 'Espacios sobrantes', en: 'Extra spaces' },
  '字体缩放': { es: 'Escala de fuente', en: 'Font scaling' },
  '字号': { es: 'Tamaño de letra', en: 'Font size' },
  '字符间距': { es: 'Espaciado entre caracteres', en: 'Character spacing' },
  '对齐到网格': { es: 'Alineación a la cuadrícula', en: 'Snap to grid' },
  '嵌套表格': { es: 'Tablas anidadas', en: 'Nested tables' },
  '异常字体效果': { es: 'Efectos de fuente inusuales', en: 'Unusual font effects' },
  '彩色图片': { es: 'Imágenes en color', en: 'Color images' },
  '彩色图表和图形': { es: 'Gráficos y formas en color', en: 'Color charts and shapes' },
  '手动换行': { es: 'Saltos de línea manuales', en: 'Manual line breaks' },
  '批注': { es: 'Comentarios', en: 'Comments' },
  '敏感信息/身份泄露': { es: 'Información sensible / identidad', en: 'Sensitive / identity info' },
  '文字颜色': { es: 'Color de texto', en: 'Text color' },
  '文本框': { es: 'Cuadros de texto', en: 'Text boxes' },
  '文档属性': { es: 'Propiedades del documento', en: 'Document properties' },
  '斜体': { es: 'Cursiva', en: 'Italic' },
  '未接受的修订': { es: 'Cambios sin aceptar', en: 'Unaccepted revisions' },
  '标题内容异常': { es: 'Contenido anómalo en títulos', en: 'Unusual heading content' },
  '标题层级跳跃': { es: 'Saltos de nivel en títulos', en: 'Heading level jumps' },
  '标题序号格式': { es: 'Formato de numeración de títulos', en: 'Heading numbering format' },
  '标题编号连续性': { es: 'Continuidad de numeración de títulos', en: 'Heading numbering continuity' },
  '正文格式一致性': { es: 'Consistencia de formato del texto', en: 'Body format consistency' },
  '正文页码文字与缺少页码': { es: 'Numeración de páginas', en: 'Page numbering' },
  '段内字体混用': { es: 'Mezcla de fuentes en el párrafo', en: 'Mixed fonts in paragraph' },
  '段前分页': { es: 'Salto de página anterior', en: 'Page break before' },
  '段前段后间距': { es: 'Espaciado entre párrafos', en: 'Paragraph spacing' },
  '段落对齐方式': { es: 'Alineación de párrafo', en: 'Paragraph alignment' },
  '特殊字符': { es: 'Caracteres especiales', en: 'Special characters' },
  '目录': { es: 'Índice', en: 'Table of contents' },
  '矢量图中的文字': { es: 'Texto en gráficos vectoriales', en: 'Text in vector graphics' },
  '空段落': { es: 'Párrafos vacíos', en: 'Empty paragraphs' },
  '突出显示和文字底纹': { es: 'Resaltado y sombreado de texto', en: 'Highlight and text shading' },
  '纸张大小': { es: 'Tamaño de papel', en: 'Paper size' },
  '纸张方向': { es: 'Orientación de página', en: 'Page orientation' },
  '英文标点': { es: 'Puntuación latina', en: 'Latin punctuation' },
  '行距': { es: 'Interlineado', en: 'Line spacing' },
  '表格字体': { es: 'Fuente en tablas', en: 'Table font' },
  '表格字号': { es: 'Tamaño de letra en tablas', en: 'Table font size' },
  '表格对齐方式': { es: 'Alineación de tablas', en: 'Table alignment' },
  '表格样式': { es: 'Estilos de tabla', en: 'Table styles' },
  '表格首行缩进': { es: 'Sangría de primera línea en tablas', en: 'Table first-line indent' },
  '西文字体': { es: 'Fuente occidental', en: 'Western font' },
  '超链接': { es: 'Hipervínculos', en: 'Hyperlinks' },
  '隐藏文字': { es: 'Texto oculto', en: 'Hidden text' },
  '页眉页脚内容': { es: 'Contenido en encabezados y pies', en: 'Header and footer content' },
  '页边距': { es: 'Márgenes de página', en: 'Page margins' },
  '页面背景色': { es: 'Color de fondo de página', en: 'Page background color' },
  '首行缩进': { es: 'Sangría de primera línea', en: 'First-line indent' },
};

/** Translate exact generated messages only; quotations and unknown text remain intact. */
export function localizeFindingText(value, language, category) {
  if (value && ruleTitles[value]?.[language]) return ruleTitles[value][language];
  if (language === 'en' && value) return value
    .replace(/^当前颜色 (#[0-9A-Fa-f]{6})(?:（主题色 ([^）]+)）)?$/, (_match, hex, theme) => `Current color ${hex}${theme ? ` (theme color ${theme})` : ''}`)
    .replace(/^主题色 ([^（]+)(?:（(#[0-9A-Fa-f]{6})）)?$/, (_match, theme, hex) => `Theme color ${theme}${hex ? ` (${hex})` : ''}`)
    .replace(/^纸张大小不是 (A3|A4|Letter)$/, 'Paper size is not $1')
    .replace(/^布局 → 纸张大小 → (A3|A4|Letter)$/, 'Layout → Paper size → $1')
    .replace(/^当前 ([\d.,]+)×([\d.,]+) cm，应为 ([\d.,]+)×([\d.,]+) cm$/, 'Current: $1×$2 cm; required: $3×$4 cm')
    .replace(/^当前 ([\d.,]+) cm，要求 ([\d.,]+) cm$/, 'Current: $1 cm; required: $2 cm');
  if (language !== 'es' || !value) return value;
  if (pageMessages[value]) return pageMessages[value];
  const differences = localizeSectionDifferences(value);
  if (differences !== value) return differences;
  const headingDifferences = localizeHeadingDifferences(value);
  if (headingDifferences !== value) return headingDifferences;
  return value
    .replace(/^当前颜色 (#[0-9A-Fa-f]{6})(?:（主题色 ([^）]+)）)?$/, (_match, hex, theme) => `Color actual ${hex}${theme ? ` (color de tema ${theme})` : ''}`)
    .replace(/^主题色 ([^（]+)(?:（(#[0-9A-Fa-f]{6})）)?$/, (_match, theme, hex) => `Color de tema ${theme}${hex ? ` (${hex})` : ''}`)
    .replace(/^所在节定义了文档网格，本段行距为「(最小值 [\d.]+ 磅|[\d.]+ 倍行距)」，Word 会把行高放大到网格行高的整数倍$/, (_match, spacing) => `La sección tiene una cuadrícula de documento y el párrafo usa ${localizeFormatValue(spacing)}; Word puede aumentar la altura de línea para ajustarla a la cuadrícula.`)
    .replace(/^共 (\d+) 条批注，批注作者：(.+)。批注会暴露作者和单位信息$/, (_match, count, authors) => `Hay ${count} comentarios; autores: ${authors === '未知' ? 'desconocidos' : authors}. Los comentarios pueden revelar información de autoría y organización.`)
    .replace(/^((?:(?:插入|删除|移动|格式修改) \d+ 处)(?:、(?:插入|删除|移动|格式修改) \d+ 处)*)。未接受的修订会暴露修改痕迹，评审时可能显示被删除的内容$/, (_match, entries) => {
      const labels = { '插入':['inserción','inserciones'], '删除':['eliminación','eliminaciones'], '移动':['movimiento','movimientos'], '格式修改':['cambio de formato','cambios de formato'] };
      const details = entries.split('、').map((entry) => entry.replace(/^(插入|删除|移动|格式修改) (\d+) 处$/, (_item, kind, count) => `${count} ${labels[kind][count === '1' ? 0 : 1]}`)).join(', ');
      return `${details}. Los cambios sin aceptar pueden revelar el historial y mostrar contenido eliminado durante la evaluación.`;
    })
    .replace(/^发现 (\d+) 处页码域，招标文件要求页码只出现在页脚$/, 'Se encontraron $1 campos de número de página; el pliego solo los permite en el pie.')
    .replace(/^发现 (\d+) 处页码域，暗标通常要求不出现页码$/, 'Se encontraron $1 campos de número de página; una oferta anónima normalmente no los permite.')
    .replace(/^双击(页眉|页脚)区域，删除页码$/, (_match, part) => `Haz doble clic en el ${part === '页眉' ? 'encabezado' : 'pie'} y elimina el número de página.`)
    .replace(/^双击(页眉|页脚)，只保留页码，删除其他内容（含图片和横线）$/, (_match, part) => `Haz doble clic en el ${part === '页眉' ? 'encabezado' : 'pie'}; conserva solo el número de página y elimina el resto, incluidas imágenes y líneas.`)
    .replace(/^双击(页眉|页脚)，删除全部内容（含图片和横线）$/, (_match, part) => `Haz doble clic en el ${part === '页眉' ? 'encabezado' : 'pie'} y elimina su contenido, incluidas imágenes y líneas.`)
    .replace(/^内容：(.+)。招标文件要求页脚只出现页码$/, 'Contenido: $1. El pliego solo permite el número de página en el pie.')
    .replace(/^内容：(.+)。页眉页脚常残留企业名称或标志，暗标要求清空$/, 'Contenido: $1. Los encabezados y pies pueden contener nombres o logotipos; comprueba el requisito de anonimato.')
    .replace(/^共 (\d+) 条目录条目，部分招标文件要求暗标不得有目录$/, 'Hay $1 entradas de índice; algunos pliegos no permiten índices en la oferta anónima.')
    .replace(/^行距未设为(固定值|最小值)$/, (_match, kind) => `El interlineado no está configurado como ${kind === '固定值' ? 'valor fijo' : 'valor mínimo'}`)
    .replace(/^存在异常字体效果（(.+)）$/, (_match, effects) => `Hay efectos de fuente (${effects.split('、').map((effect) => fontEffects[effect] || effect).join(', ')})`)
    .replace(/^(页眉|页脚)中存在页码$/, (_match, part) => `Hay números de página en el ${part === '页眉' ? 'encabezado' : 'pie'}`)
    .replace(/^(页眉|页脚)存在内容$/, (_match, part) => `El ${part === '页眉' ? 'encabezado' : 'pie'} contiene información`)
    .replace(/^文档属性中残留「(作者|最后修改者)」$/, (_match, field) => `Las propiedades del documento contienen ${field === '作者' ? 'el autor' : 'el último editor'}`)
    .replace(/^(\d+) 级标题格式与同级多数不一致$/, 'El formato del título de nivel $1 difiere de la mayoría del mismo nivel')
    .replace(/^上一个同级标题编号为「(.+)」，此处仍为「(.+)」$/, 'El título anterior del mismo nivel era «$1» y aquí se repite «$2».')
    .replace(/^上一个同级标题编号为「(.+)」，此处为「(.+)」，中间缺少 (\d+) 个编号$/, (_match, previous, current, count) => `El título anterior era «${previous}» y el actual es «${current}»; ${count === '1' ? 'falta 1 número intermedio' : `faltan ${count} números intermedios`}.`)
    .replace(/^上一个标题是 (\d+) 级「(.+)」，此处直接出现 (\d+) 级标题，中间缺少 (\d+) 级$/, 'El título anterior era de nivel $1 «$2» y el actual es de nivel $3; falta el nivel $4.')
    .replace(/^(\d+) 级标题「(.+)」没有标题文字$/, 'El título de nivel $1 «$2» no tiene texto.')
    .replace(/^(\d+) 级标题共 (\d+) 字，超过 (\d+) 字，常见原因是正文段落误用了标题样式$/, 'El título de nivel $1 tiene $2 caracteres, por encima de $3; comprueba si se aplicó un estilo de título por error.')
    .replace(/^本段为「(.+)」，正文多数为「(.+)」（约占 ([\d.]+%)）$/, 'Este párrafo usa «$1»; la mayoría usa «$2» (aproximadamente $3).')
    .replace(/^确认字体是否需要统一；统一时把中文字体设为「(.+)」$/, 'Comprueba si hay que unificar la fuente; si procede, usa «$1» para el texto chino.')
    .replace(/^本段为(?:[\p{Script=Han}]+（)?([\d.]+)磅(?:）)?，正文多数为(?:[\p{Script=Han}]+（)?([\d.]+)磅(?:）)?（约占 (\d+%)）$/u, 'Este párrafo usa $1 pt; la mayoría usa $2 pt (aproximadamente $3).')
    .replace(/^确认字号是否需要统一；统一时设为(?:[\p{Script=Han}]+（)?([\d.]+)磅(?:）)?$/u, 'Comprueba si hay que unificar el tamaño; si procede, usa $1 pt.')
    .replace(/^本段为「(左对齐|右对齐|两端对齐|居中|分散对齐)」，正文多数为「(左对齐|右对齐|两端对齐|居中|分散对齐)」，该对齐方式只占 (\d+%)$/, (_match, current, majority, percentage) => `Este párrafo está ${localizeFormatValue(current)}; la mayoría está ${localizeFormatValue(majority)} y la alineación actual aparece en solo el ${percentage}.`)
    .replace(/^本段使用了 ((?:「[^」]+」)(?:、「[^」]+」)*)$/, 'Este párrafo usa las fuentes $1.')
    .replace(/^出现敏感词「(.+)」$/, 'Se encontró el término sensible «$1»')
    .replace(/^出现自称「(.+)」$/, 'Se encontró una referencia a la propia empresa: «$1»')
    .replace(/^出现敏感字段「(.+)」$/, 'Se encontró el campo sensible «$1»')
    .replace(/^命中自定义规则「(.+)」$/, 'Coincidencia con una regla personalizada: «$1»')
    .replace(/^出现企业名称「(.+)」$/, 'Se encontró el nombre de empresa «$1»')
    .replace(/^出现手机号「(.+)」$/, 'Se encontró el número de celular «$1»')
    .replace(/^出现固定电话「(.+)」$/, 'Se encontró el número de teléfono fijo «$1»')
    .replace(/^出现身份证号「(.+)」$/, 'Se encontró el número de identificación «$1»')
    .replace(/^出现统一社会信用代码「(.+)」$/, 'Se encontró el código de crédito social «$1»')
    .replace(/^出现邮箱地址「(.+)」$/, 'Se encontró la dirección de correo «$1»')
    .replace(/^出现网址「(.+)」$/, 'Se encontró la dirección web «$1»')
    .replace(/^出现疑似银行账号「(.+)」$/, 'Se encontró una posible cuenta bancaria «$1»')
    .replace(/^残留未填写的占位符「(.+)」$/, (_match, marker) => `Hay un marcador sin completar: «${marker.replace(/【(?:待填写|待补充)】/g, '[Pendiente por completar]').replace(/【待确认】/g, '[Pendiente por confirmar]')}»`)
    .replace(/^中文内容中使用了英文标点（(.+)）$/, 'Se usa puntuación latina junto a texto chino ($1)')
    .replace(/^本段共 (\d+) 处，例如「(.+)」应改为「(.+)」$/, 'Hay $1 casos en este párrafo; por ejemplo, «$2» se cambiaría por «$3».')
    .replace(/^存在多余空格（(.+)）$/, (_match, kinds) => `Hay espacios sobrantes (${kinds.split('、').map((kind) => textRuleNames[kind] || kind).join(', ')})`)
    .replace(/^存在特殊不可见字符（(.+)）$/, (_match, kinds) => `Hay caracteres invisibles (${kinds.split('、').map((kind) => textRuleNames[kind] || kind).join(', ')})`)
    .replace(/^本段有 (\d+) 个制表符，容易造成缩进不一致$/, 'El párrafo tiene $1 tabuladores que pueden causar sangrías irregulares.')
    .replace(/^本段有 (\d+) 个手动换行（Shift\+Enter），会让每页行数不可控$/, 'El párrafo tiene $1 saltos manuales (Mayús+Intro), lo que puede alterar el número de líneas por página.')
    .replace(/^本段文字里夹有 (\d+) 个换行字符，本应分开的几段内容并成了一段，Word 中显示为空格$/, 'El párrafo contiene $1 saltos de línea dentro del texto; Word los muestra como espacios aunque podrían separar párrafos.')
    .replace(/^本段共 (\d+) 处，中文语境应使用全角括号（）$/, 'Hay $1 casos; junto al texto chino se recomienda usar paréntesis de ancho completo （）.')
    .replace(/^使用了全角(数字|字母)$/, (_match, kind) => `Se usan ${kind === '数字' ? 'dígitos' : 'letras'} de ancho completo`)
    .replace(/^(.+)，彩色像素约占 (\d+)%(?:，文中引用 (\d+) 次)?$/, (_match, image, percentage, uses) => `${image}: aproximadamente ${percentage}% de píxeles en color${uses ? `; se usa ${uses} veces en el documento` : ''}.`)
    .replace(/^(.+)是矢量图，程序不能解码颜色(?:，文中引用 (\d+) 次)?$/, (_match, image, uses) => `${image} es una imagen vectorial cuyo color no se puede analizar automáticamente${uses ? `; se usa ${uses} veces en el documento` : ''}.`)
    .replace(/^(.+)中可提取到文字，未发现身份信息，请确认图框、标注里没有单位名称等内容(?:，文中引用 (\d+) 次)?$/, (_match, image, uses) => `Se extrajo texto de ${image}; no se detectaron datos de identidad. Comprueba que las anotaciones no identifiquen a una empresa${uses ? `; se usa ${uses} veces en el documento` : ''}.`)
    .replace(/^(.+)中的文字(.+?)(?:，文中引用 (\d+) 次)?$/, (_match, image, hits, uses) => `Texto de ${image}: ${hits.split('；').map((hit) => localizeFindingText(hit, language, 'privacy')).join('; ')}${uses ? `; se usa ${uses} veces en el documento` : ''}.`)
    .replace(/^(.+)带有元数据，未发现身份信息，请确认其中没有单位或个人信息。字段：(.+)$/, (_match, image, fields) => `${image} contiene metadatos; no se detectaron datos de identidad. Comprueba que no incluyan información personal o de una empresa. Campos: ${localizeImageFields(fields)}`)
    .replace(/^(.+)的元数据(.+)。字段：(.+)$/, (_match, image, hits, fields) => `Metadatos de ${image}: ${hits.split('；').map((hit) => localizeFindingText(hit, language, 'privacy')).join('; ')}. Campos: ${localizeImageFields(fields)}`)
    .replace(/^图表颜色：(.+)$/, (_match, color) => `Color del gráfico: ${localizeColorValue(color)}`)
    .replace(/^配色中含有(.+)$/, (_match, color) => `La paleta incluye ${localizeColorValue(color)}`)
    .replace(/^填充或线条颜色：(.+)$/, (_match, color) => `Color de relleno o línea: ${localizeColorValue(color)}`)
    .replace(/^(.+)的 EXIF 中记录了拍摄位置，可能暴露投标人所在地$/, '$1 contiene ubicación GPS en sus datos EXIF, lo que podría revelar la ubicación del oferente.')
    .replace(/^该单元格有 (\d+) 个空段落（需保留 1 个），多余的会造成额外空行$/, 'La celda tiene $1 párrafos vacíos; conserva uno para evitar líneas adicionales.')
    .replace(/^当前序号「(.+)」，要求 (\d+) 级标题为「(.+)」$/, 'Numeración actual: «$1»; el título de nivel $2 requiere «$3».')
    .replace(/^招标文件要求标题按阿拉伯数字分级编号，(\d+) 级标题应为「(.+)」$/, 'El pliego exige numeración arábiga por niveles; el título de nivel $1 debe ser «$2».')
    .replace(/^当前「(.+)」是 (\d+) 级编号，本标题为 (\d+) 级，应为「(.+)」$/, 'La numeración «$1» es de nivel $2, pero el título es de nivel $3; debe ser «$4».')
    .replace(/^本段共 (\d+) 个全角(数字|字母)，例如「(.+)」，与半角\2混用会显得不统一$/, (_match, count, kind, sample) => `Hay ${count} ${kind === '数字' ? 'dígitos' : 'letras'} de ancho completo, por ejemplo «${sample}»; mezclarlos con caracteres de ancho medio puede ser inconsistente.`)
    .replace(/^纸张大小不是 (A3|A4|Letter)$/, 'El tamaño del papel no es $1')
    .replace(/^第 (\d+) 节$/, 'Sección $1')
    .replace(/^中文字体不是(.+)$/, 'La fuente del texto chino no es $1')
    .replace(/^西文字体不是(.+)$/, 'La fuente occidental no es $1')
    .replace(/^当前「(.+)」，要求「(.+)」$/, (_match, current, target) => `Actual: «${['paragraph', 'table'].includes(category) ? localizeFormatValue(current) : current}»; requerido: «${['paragraph', 'table'].includes(category) ? localizeFormatValue(target) : target}»`)
    .replace(/^选中文字，把中文字体设为「(.+)」$/, 'Selecciona el texto y establece la fuente china en «$1».')
    .replace(/^选中文字，在「中文字体」中设为「(.+)」$/, 'Selecciona el texto y establece la fuente china en «$1».')
    .replace(/^选中文字，在「西文字体」中设为「(.+)」$/, 'Selecciona el texto y establece la fuente occidental en «$1».')
    .replace(/^字号不是(?:[\p{Script=Han}]+（)?([\d.]+)磅(?:）)?$/u, 'El tamaño no es $1 pt')
    .replace(/^当前(?:[\p{Script=Han}]+（)?([\d.]+)磅(?:）)?，要求(?:[\p{Script=Han}]+（)?([\d.]+)磅(?:）)?$/u, 'Actual: $1 pt; requerido: $2 pt')
    .replace(/^选中文字，把字号设为(?:[\p{Script=Han}]+（)?([\d.]+)磅(?:）)?$/u, 'Selecciona el texto y establece el tamaño en $1 pt.')
    .replace(/^要求 (\d+) 级标题加粗$/, 'El título de nivel $1 debe estar en negrita.')
    .replace(/^要求 (\d+) 级标题不加粗$/, 'El título de nivel $1 no debe estar en negrita.')
    .replace(/^字符间距 ([-\d.]+) 磅，可能被视为隐形标记$/, 'El espaciado entre caracteres es de $1 pt y podría interpretarse como una marca invisible.')
    .replace(/^当前缩放 (\d+)%\uFF0C正常应为 100%$/, 'La escala actual es $1%; la habitual es 100%.')
    .replace(/^表格内中文字体不是(.+)$/, 'La fuente china de la tabla no es $1')
    .replace(/^表格内字号不是(?:[\p{Script=Han}]+（)?([\d.]+)磅(?:）)?$/u, 'El tamaño en la tabla no es $1 pt')
    .replace(/^选中表格文字，把中文字体设为「(.+)」$/, 'Selecciona el texto de la tabla y establece la fuente china en «$1».')
    .replace(/^选中表格文字，把字号设为(?:[\p{Script=Han}]+（)?([\d.]+)磅(?:）)?$/u, 'Selecciona el texto de la tabla y establece el tamaño en $1 pt.')
    .replace(/^第 (\d+) 个表格$/, 'Tabla $1')
    .replace(/^当前 ([\d.]+) 字符，要求 ([\d.]+) 字符$/, 'Actual: $1 caracteres; requerido: $2 caracteres')
    .replace(/^当前 ([\d.]+) 倍，要求 ([\d.]+) 倍$/, 'Actual: $1 veces; requerido: $2 veces')
    .replace(/^当前 ([\d.]+) 磅，要求 ([\d.]+) 磅$/, 'Actual: $1 pt; requerido: $2 pt')
    .replace(/^共 (\d+) 个单元格，底纹色示例：(.+)。格式要求不允许使用彩色$/, 'Hay $1 celdas con sombreado; colores de ejemplo: $2. Los requisitos de formato no permiten color.')
    .replace(/^共 (\d+) 个单元格内嵌套了表格，评审系统解析文字时容易错乱$/, 'Hay tablas anidadas en $1 celdas; el sistema de evaluación podría interpretar mal el texto.')
    .replace(/^共 (\d+) 个表格含合并单元格（第 (.+) 个表格），合计 (\d+) 处合并。合并单元格在评审系统中可能显示错位$/, (_match, tables, list, cells) => `${tables} tablas tienen celdas combinadas (tablas ${list.replaceAll('、', ', ').replace(/ 等$/, ' y otras')}); hay ${cells} combinaciones. El sistema de evaluación podría mostrarlas desalineadas.`)
    .replace(/^样式：(.+)。内置表格样式常带彩色表头或隔行底纹，暗标通常要求表格黑白无底纹$/, (_match, styles) => `Estilos: ${styles.split('、').map((item) => item.replace(/^(.+)（(\d+) 个表）$/, (_item, name, count) => `${name} (${count} ${count === '1' ? 'tabla' : 'tablas'})`)).join(', ')}. Los estilos integrados pueden incluir colores; la oferta anónima suele requerir tablas en blanco y negro sin sombreado.`)
    .replace(/^开始 → 段落 → 特殊 → 首行，缩进值 ([\d.]+) 字符$/, 'Inicio → Párrafo → Especial → Primera línea; sangría: $1 caracteres.')
    .replace(/^开始 → 段落 → 行距 → (固定值|最小值)，设置值 ([\d.]+) 磅$/, (_match, kind, points) => `Inicio → Párrafo → Interlineado → ${kind === '固定值' ? 'Exacto' : 'Mínimo'}: ${points} pt.`)
    .replace(/^开始 → 段落 → 行距 → (固定值|最小值)$/, (_match, kind) => `Inicio → Párrafo → Interlineado → ${kind === '固定值' ? 'Exacto' : 'Mínimo'}.`)
    .replace(/^当前段(前|后) ([\d.]+) 磅，要求 ([\d.]+) 磅$/, (_match, side, current, target) => `Espaciado ${side === '前' ? 'anterior' : 'posterior'}: ${current} pt; requerido: ${target} pt.`)
    .replace(/^当前段(前|后)为「自动」（Word 约按 14 磅显示），要求 ([\d.]+) 磅$/, (_match, side, target) => `Espaciado ${side === '前' ? 'anterior' : 'posterior'} automático (Word muestra aproximadamente 14 pt); requerido: ${target} pt.`)
    .replace(/^开始 → 段落 → 间距 → 段(前|后)，取消「自动」并设为 ([\d.]+) 磅$/, (_match, side, target) => `Inicio → Párrafo → Espaciado → ${side === '前' ? 'Antes' : 'Después'}; desactiva «Automático» y usa ${target} pt.`)
    .replace(/^布局 → 纸张大小 → (A3|A4|Letter)$/, 'Diseño → Tamaño del papel → $1')
    .replace(/^当前 ([\d.,]+)×([\d.,]+) cm，应为 ([\d.,]+)×([\d.,]+) cm$/, 'Actual: $1×$2 cm; requerido: $3×$4 cm')
    .replace(/^当前 ([\d.,]+)×([\d.,]+) cm（横向），暗标正文通常要求纵向$/, 'Actual: $1×$2 cm (horizontal); el texto de la oferta anónima suele requerir orientación vertical.')
    .replace(/^当前 ([\d.,]+) cm，要求 ([\d.,]+) cm$/, 'Actual: $1 cm; requerido: $2 cm')
    .replace(/^该节分为 (\d+) 栏，暗标正文一般要求单栏$/, 'La sección tiene $1 columnas; el texto de la oferta anónima suele requerir una sola columna.')
    .replace(/^页面颜色 #(\w+)，格式要求不允许使用彩色$/, 'El color de página es #$1; los requisitos de formato no permiten color.');
}
