> [中文原文](开发说明.md) | [English](DEVELOPMENT.en.md) | [Español](DEVELOPMENT.es.md)

---
name: Notas de desarrollo del asistente Open XML
about: Documenta el modelo de procesos, el protocolo de señales, los directorios de tareas y las restricciones de empaquetado para la colaboración entre openxmlhelper y el proceso Main de Electron; no es un registro de funcionalidades terminadas.
---

# Notas de desarrollo del asistente Open XML

Este documento está dirigido a quienes desarrollan el asistente de Word / Open XML o el lado Main que lo integra. El comportamiento real lo define el código actual; este documento solo conserva los límites estables.

## Posicionamiento

- El directorio raíz `openxmlhelper/` es una aplicación de consola .NET 10 independiente que realiza el trabajo de Word / Open XML para el proceso Main de Electron.
- El Renderer nunca se conecta directamente al asistente ni pasa por preload.
- El programa principal lo invoca mediante `openXmlHelperService.runJob`; los agentes invocan el mismo conjunto de acciones mediante la herramienta Pi dedicada `openxml`. No incluya el exe del asistente en PATH.

## Procesos

- Permanece residente durante mucho tiempo y ejecuta una sola tarea a la vez. Main lo inicia de forma diferida (lazy) al enviarse la primera tarea y lo termina al salir la aplicación.
- El único argumento de arranque es la ruta raíz del espacio de trabajo: `openxmlhelper --workspace <userData/workspace>`.
- El asistente no crea directorios numerados de tareas; la numeración la asigna Main.

## Comunicación

La tubería (pipe) solo transmite «iniciar trabajo» y «terminado». stdin / stdout llevan cada uno una línea JSON UTF-8 por mensaje, sin BOM, con saltos de línea solo `\n` (también en Windows). No introduzca el contenido del documento en la tubería.

Main → asistente:

```json
{"v":1,"type":"run","job":"20260819153000-ab12"}
```

Asistente → Main:

```json
{"v":1,"type":"done","job":"20260819153000-ab12","ok":true}
```

- `job` solo permite letras, dígitos, `.`, `_`, `-`, para evitar path traversal.
- Los fallos también responden solo con `ok:false`. La causa se escribe en `result.json` del directorio de la tarea.
- Las señales que no se pueden analizar se escriben en stderr; el proceso no termina.
- Cuando el asistente está ocupado, las tareas que lleguen después obtienen un resultado de fallo escrito y una respuesta `done`.
- No hay señal de apagado; la salida depende de que Main termine el proceso.

## Directorios de tareas

Ambos lados leen y escriben archivos por sí mismos y no pasan contenido por la tubería.

`workspace/openxml-jobs/<job>/`

| Archivo | Quién lo escribe | Significado |
|---|---|---|
| `request.json` | Main | Contiene al menos `action` |
| `result.json` | Asistente | Contiene al menos `ok`; en caso de fallo también `error` |

Convención: termine de escribir todas las entradas antes de enviar `run`; termine de escribir `result.json` antes de enviar `done`.

Acciones actuales:

```json
{"action":"ping"}
```

```json
{
  "action": "list-blocks",
  "sources": ["technical-plan/tender-originals/xxx.docx"]
}
```

`list-blocks` escribe `blocks.json` en el directorio de la tarea, con el número de orden, el tipo, si es título y una vista previa del texto original de cada bloque.

```json
{
  "action": "extract-chapters",
  "sources": ["technical-plan/tender-originals/xxx.docx"],
  "chapters": [{"id":"1","title":"施工组织设计","sourceTitle":"第五章 施工组织设计"}],
  "output": "technical-plan/bid-template.docx"
}
```

`extract-chapters` extrae capítulos según los títulos originales o los rangos de bloques indicados por el agente: solo los títulos originales con `heading=true` pueden usar `sourceTitle`; los estilos que no son títulos deben proporcionar tanto `startBlock` como `endBlock`, y el asistente no inferirá automáticamente límites finales para rangos incompletos ni para bloques que no sean títulos. `title` es solo el nombre del capítulo usado en la plantilla; si no hay una localización (定位) válida en el documento original, falla.

Tras una extracción exitosa, junto al DOCX de salida se escribe un archivo lateral `.chapters.json` con el mismo nombre base, por ejemplo `technical-plan/bid-template-source.chapters.json`. El formato es `{version:1,chapters:[{id?,title,start_block,end_block}]}`; los números de bloque son índices de base 0 en el cuerpo del DOCX destino, `start_block` es inclusivo y `end_block` es exclusivo. El escaneo de campos lo usa para identificar a qué capítulo pertenece cada candidato; si el archivo falta o no es válido, el escaneo falla y pide volver a extraer los capítulos.

```json
{
  "action": "scan-template-fields",
  "input": "technical-plan/bid-template-source.docx"
}
```

`scan-template-fields` escribe en el directorio de la tarea un `template-field-candidates.json` compacto de una sola línea, cuyo nivel superior contiene `version`, `default_suggested_fill_by`, así como `contexts` y `candidates` sin duplicados. Cada entrada de `contexts` contiene un `context_id` y proporciona `chapter_name`, `table_title`, `column_header`, `group_title` según el contenido real; los candidatos referencian contextos mediante `context_id` y proporcionan `row_number`, `column_number` de base 1 según sea necesario. Los números de columna de tabla se calculan sobre la cuadrícula lógica expandida por `gridBefore` / `gridSpan`; los campos vacíos no se emiten; los candidatos sin `suggested_fill_by` propio usan el valor predeterminado superior. Los candidatos fuera de tabla emiten su posición original según sea necesario, los de tabla usan contexto estructural más localización (定位) por fila/columna, y la posición original interna sigue participando en el cálculo del `candidate_id` estable. Los candidatos solo sirven para que el agente genérico de plantillas los clasifique, no como lista definitiva de campos de negocio.

```json
{
  "action": "apply-template-fields",
  "input": "technical-plan/bid-template-source.docx",
  "output": "technical-plan/bid-template.docx",
  "fields_output": "technical-plan/bid-template-fields.json",
  "fields": [
    {"candidate_id":"c_xxx","name":"投标人名称","fill_by":"ai"},
    {"candidate_id":"c_yyy","name":"法定代表人签字","fill_by":"manual"}
  ],
  "ignored_candidate_ids": ["c_zzz"]
}
```

`apply-template-fields` exige que cada candidato quede exactamente en `fields` o en `ignored_candidate_ids`. El asistente vuelve a escanear la plantilla origen y escribe `w:sdt` en las posiciones de los candidatos: el ID de negocio se guarda en `w:tag=savia:field:<id>`, el nombre del campo en `w:alias`; tanto los campos de IA como los manuales usan fondo rojo claro `FCE8E6` y texto negro `000000`. Al final se generan `bid-template.docx` y un JSON reducido de campos; el mismo `name` puede corresponder a varios ID distintos.

El ejemplo anterior es la solicitud interna entre Main y el asistente. Cuando el agente usa `openxml`, solo pasa `{"action":"apply-template-fields","fields_file":"投标模版字段分类.json"}`; el nivel superior del archivo de clasificación contiene `fields` e `ignored_candidate_ids` completos. La ruta normal es llamar a esta acción justo después de que `write` termine el archivo de clasificación, sin ejecutar comprobaciones previas adicionales con Bash o scripts. La herramienta Pi primero lee el archivo UTF-8 y realiza la validación estructural JSON/Ajv; luego el asistente vuelve a escanear la plantilla origen, comprueba omisiones, duplicados, solapamientos o candidatos no válidos, así como la coherencia de `fill_by` y de campos con el mismo nombre. Tras escribir los controles de contenido, ejecuta validación Open XML y de artefactos. En caso de fallo, el agente corrige el mismo archivo completo de clasificación y reintenta según el error de la herramienta; cuando la aplicación tiene éxito y los artefactos pasan, el programa termina directamente la tarea de extracción de plantilla.

```json
{
  "action": "insert-body-html",
  "input": "technical-plan/template.docx",
  "target_id": "technical-plan",
  "image_max_width_percent": 90,
  "html": "<!-- savia:block -->\n<p id=\"p_001\">正文内容</p>\n<!-- savia:block -->\n<figure id=\"fig_001\" data-sv-generation=\"htmlImage\" data-sv-size=\"wide\"><template data-sv-role=\"prompt\">配图提示</template><img alt=\"质量控制图\" data-sv-asset-ref=\"generated-images/quality.png\"><figcaption>质量控制图</figcaption></figure>"
}
```

`insert-body-html` convierte el HTML restringido de Savia (Savia) en bloques Open XML y sustituye en su lugar el único control de contenido a nivel de bloque `w:tag=savia:body:<target_id>` del documento Word. El destino debe ser un `w:sdtBlock`; los controles de contenido a nivel de ejecución (run) o de celda no son posiciones de inserción del contenido. La acción usa una copia temporal para completar la conversión y la validación Open XML, y solo después sustituye el archivo original. `image_max_width_percent` es el ancho máximo global para imágenes independientes; `figure` debe usar `data-sv-size=square|wide|tall|panorama`, y `data-sv-asset-ref` de `img` debe ser una ruta relativa al espacio de trabajo; las imágenes se recortan centradas en el marco predefinido conservando los pies de figura, y la indicación (prompt) de ilustración `template` no se escribe en Word.

```json
{
  "action": "blind-check-inspect",
  "source": "blind-check/source/<fileId>.docx",
  "profile": {"page": {}, "body": {}, "headings": {}, "table": {}, "structure": {}, "text": {}, "privacy": {}, "props": {}, "consistency": {}, "image": {}, "rules": {}},
  "sensitive_words": [{"text": "某某建设有限公司", "source": "credential"}],
  "image_facts": [{"part": "word/media/image1.png", "color": true, "color_ratio": 0.23}]
}
```

`blind-check-inspect` es la comprobación de conformidad de oferta ciega (暗标合规检查), implementada en `BlindCheck/`. Solo abre para lectura una copia del docx en el espacio de trabajo: localiza las partes directamente por entradas zip y archivos de relaciones, y luego lee con LINQ to XML, sin pasar por las envolturas fuertemente tipadas del SDK, de modo que relaciones de hipervínculo malformadas no impiden abrir el documento. `profile` es el preajuste completo normalizado por Main con valores predeterminados fusionados; null significa que el elemento no se comprueba (no lo exigen los pliegos): `BlindCheckProfile.Bool` distingue campo ausente (se usa valor de reserva) de null (no se comprueba), `body.allow_*` null significa permitido, `table.allow_*` null significa igual que el cuerpo; `sensitive_words` son palabras sensibles personalizadas del preajuste más la información empresarial de la biblioteca de credenciales.

- Evaluación: tipos y tamaños de letra, etc., resuelven valores efectivos vía docDefaults → estilo de tabla → cadena de estilos de párrafo → cadena de estilos de carácter → formato directo. Las fuentes de tema resuelven theme1.xml, con reserva por las tablas de scripts Hans y otros cuando ea está vacío. La búsqueda de fuentes recorre las ranuras capa por capa; una capa que solo escriba `w:hint` no oculta las capas inferiores. El formato de marca de párrafo `w:pPr/w:rPr` solo se aplica a la marca de párrafo, no a la evaluación de bloques de texto. Simplificación conocida: propiedades de interruptor como negrita o cursiva toman una sola capa de máxima prioridad, sin XOR entre capas de estilo; los estilos de tabla solo toman `pPr/rPr` superior, sin fusionar formato condicional `w:tblStylePr` (primera fila, primera columna, bandas, etc.). La corrección escribe formato directo explícito, no afectado por estos dos puntos; la excepción es eliminar texto oculto: cuando no hay oculto directo pero dos o más capas de estilo lo ocultan (`RunFormat.VanishStacked`), los interruptores pueden cancelarse y el texto resulta visible — ese texto solo se informa, no se elimina, y se deja a revisión manual.
- Títulos: primero las entradas del índice (campo TOC o estilos toc), luego estilos de título y niveles de esquema; solo sin índice se recurre a los dos primeros niveles de numeración como «第X章 (Capítulo X)» o «一、 (1.)». Un párrafo que contenga el inicio o fin del campo TOC, cuando el texto está totalmente fuera del campo (p. ej. «fin de campo + salto de página + texto de título» en un párrafo), cuenta como cuerpo, no como índice; los párrafos con estilos de índice fuera de campos solo cuentan como índice cuando aparecen en serie, precedidos por un título de índice o con más de la mitad terminando en números de página — párrafos sueltos del cuerpo con estilos de índice por accidente no cuentan.
- Alcance: alineación y sangría de primera línea solo comprueban el cuerpo; pies de figura/tabla (dentro de 40 caracteres, empezando por «图/表/附图/附表 (Figura/Tabla/Figura suplementaria/Tabla suplementaria)» más número o puntuación, inmediatamente junto a un párrafo con imagen o tabla) y un título de índice solo en su propia línea antes del índice (línea corta terminada en «目录/目次 (Índice)», `OutlineAnalyzer.IsTocTitle`) no se comprueban; interlineado y espacio anterior/posterior comprueban también los títulos; negrita, cursiva, subrayado, color, resaltado y sombreado de texto comprueban también el texto de tablas, y cuando las tablas no tienen regla propia siguen el requisito del cuerpo. El sombreado coloreado de tablas y el color de fondo de página caen en «no se permite color», solo se comprueban cuando el texto de color del cuerpo está prohibido; gráficos, SmartArt y formas se juzgan por relleno y colores de línea (incluidos valores predeterminados de estilo y colores automáticos de gráficos), los gráficos vectoriales piden confirmación manual. Puntuación inglesa, espacios extra, saltos de línea manuales, columnas y reglas de coherencia no provienen de los pliegos y son siempre sugerencias de riesgo bajo.
- Numeración de títulos: `structure.heading_numbering` arabic comprueba la numeración de cada título — la automática por formato y nivel de numbering.xml (`NumberingFormats`, incluidos lvlOverride e isLgl, sin expandir numStyleLink), la manuscrita por el «1、», «1.1», etc. inicial; numerales no arábigos o nivel no acorde al nivel del título son riesgo medio, ausencia de número es riesgo bajo, los títulos anteriores al primer título numerado se tratan como título global del documento y no se informan; los títulos solo identificados por estilo de numeración solo se comparan como arábigos, no por nivel. Los saltos de línea incrustados directamente en el texto (mostrados como espacios en Word) se describen por separado en la comprobación de saltos manuales.
- Reglas: 64 reglas en total, por categorías privacy / structure / image / page / paragraph / font / text / table / consistency. Una sola regla fallida no interrumpe; los errores van a `rule_errors`. Los resultados se agrupan por «regla + gravedad + conclusión + si es candidato», conservando 6 muestras de inicio/fin por grupo, más hasta 200 entradas de localización (定位) en orden de documento con números de párrafo (`items[].locator`) para revisión por IA. La gravedad es high / medium / low; el preajuste `rules.<id>.enabled / severity` puede anular reglas individuales.
- Cuestiones candidatas (`candidate`): cuestiones que las reglas solo pueden preseleccionar y cuya infracción real debe juzgar la IA. Todas las reglas de coherencia son candidatas (`RuleSpec.Candidate`); nombres de empresa por sufijo, nombres de campos de formulario, presuntos números de cuenta bancaria y marcadores son candidatos (`Finding.Candidate`), mientras que palabras sensibles, autoidentificación, datos de contacto y números de identificación son hallazgos determinados. Candidatos y no candidatos se agrupan por separado.
- Números de párrafo (`DocumentModel.Locators`): cuerpo `p{número}`, tablas `t{tabla}.r{fila}.c{col}` (con `.{n.º}` adicional para varios párrafos en una celda), encabezados/pies `hdr{n}.{k}` / `ftr{n}.{k}`, notas al pie/finales `fn.{k}` / `en.{k}`, cuadros de texto `tb{k}`. El mismo archivo se modela siempre con los mismos números; resultados, exportación de estructura y ediciones del agente se localizan (定位) con ellos.
- Reglas de coherencia (`ConsistencyRules`) solo actúan como reserva cuando el elemento del preajuste es null (no se comprueba): títulos del mismo nivel y cuerpo usan mayoría frente a minoría, fuentes del cuerpo en chino solo cuentan bloques chinos; la numeración de títulos solo mira números manuscritos, agrupa por título padre y solo informa saltos o duplicados. Nueve subelementos — configuración de página por sección, ajuste a cuadrícula, super/subíndice, alineación de tablas, celdas combinadas, marcadores con nombre, paréntesis de medio ancho, dígitos de ancho completo, letras de ancho completo — se controlan por interruptores del preajuste y están desactivados por defecto.
- Portada e índice manuscrito: con `structure.skip_cover` (activado por defecto), el contenido desde el inicio hasta el primer salto de página o de sección, sin títulos ni tablas y dentro de 15 párrafos / 300 caracteres, se trata como portada y queda excluido de las reglas de formato del cuerpo, mientras que identidad y texto oculto sí se comprueban y las estadísticas devuelven `cover_paragraphs`. El texto oculto (`text.hidden`, `AllRegions`) cubre todas las regiones: cuerpo, tablas, portada, índice, encabezados/pies, notas y cuadros de texto se comprueban, y la corrección elimina región por región; la comprobación de tamaño no distingue escrituras orientales/occidentales, y números o texto occidental aislados también siguen el tamaño del cuerpo. Sin campo TOC, 3 o más entradas «manuscritas» consecutivas al inicio cuyo texto coincide con títulos posteriores (títulos por numeración) se agrupan (归入) en el índice; la numeración da niveles nominales que no participan en saltos de nivel. Los nombres de campos de formulario (teléfono, empresa, etc.) solo se informan con dos puntos detrás u ocupando solos una celda.
- Encabezados/pies: los números de página se juzgan por `structure.page_number` (forbid prohíbe números; footer_only solo los permite en pies, cualquier otro contenido del pie se informa; null sin límite). El contenido se lee párrafo a párrafo como texto visible, el texto de cuadros cuenta como texto del cuadro, las imágenes cuentan como «[图片 (imagen)]», las tablas cuentan su texto; los bordes de párrafo visibles (primero ajuste directo, luego cadena de estilos, nil/none cuentan como ninguno) cuentan como «[横线 (línea horizontal)]», y el estilo «页眉 (Encabezado)» del Word chino trae borde inferior por defecto, visible aun sin texto; comprobación y corrección comparten `StructureRules.HeaderFooterMarks`; los párrafos con solo campos de número cuentan como números, no como contenido, así los cuadros de número de WPS no se tratan como imágenes.
- Imágenes: `ImageCatalog` recoge imágenes referenciadas por cuerpo, encabezados/pies y notas por parte, deduplica por parte y las localiza en el primer párrafo donde aparecen; `ImageFormats` identifica formato y dimensiones por cabecera, lee autor/copyright y GPS de EXIF / XMP / bloques de texto PNG, y extrae texto de EMF (EXTTEXTOUT y DrawString EMF+), WMF (TEXTOUT / EXTTEXTOUT, texto ANSI decodificado como GBK) y SVG para detección de identidad. El juicio de color requiere decodificar píxeles, que el asistente no hace; Main muestrea y lo pasa vía `image_facts`; las estadísticas devuelven `images / image_formats / vector_images` con los resultados.
- El progreso se escribe en `progress.json` del directorio como `{frac, label}`, primero a archivo temporal y luego reemplazado; los resultados van a `blind-check-result.json` (nomenclatura snake_case), mientras `result.json` solo lleva `ok/output`.

El lado Main usa un proceso asistente `blind-check` independiente (`openXmlHelperService.runBlindCheck`), sondeando el progreso cada 300 ms hasta 10 minutos. Al terminar o cancelarse la comprobación, ese proceso se termina y el directorio se elimina, para no mantener memoria de documentos grandes en un proceso inactivo; el `close()` del restablecimiento del plan técnico no lo afecta, y al salir la aplicación lo termina `closeBlindCheck()`. Ejecutar `node --test scripts/check-blind-check.cjs` (directorio client) verifica en un directorio temporal chino que la herencia no da falsos positivos, que las violaciones se detectan, anonimato, títulos por índice, coherencia, metadatos de imagen y texto vectorial, reglas finas, exportación Excel, cancelación y rendimiento con 40000 párrafos.

```json
{
  "action": "blind-check-fix",
  "source": "blind-check/source/<fileId>.docx",
  "output": "blind-check/fixed/<fileId>.docx",
  "profile": {},
  "sensitive_words": [],
  "image_facts": [],
  "fix_rules": ["struct.doc_props", "font.size", "text.english_punct"]
}
```

`blind-check-fix` es la corrección automática de oferta ciega, implementada en `BlindCheck/Fix/`. Comparte `BlindCheckSession` con la comprobación (abrir documento, modelar, identificar títulos de índice y portada); el archivo original no se toca y los resultados van a la copia del espacio de trabajo en `output`:

- Planificación (`BlindCheckFixer`): en lugar de usar las muestras ya fusionadas de la fase de comprobación, vuelve a ejecutar por párrafo y bloque de texto las funciones de comprobación de `fix_rules` sobre el mismo modelo, y solo corrige cuando se informa un problema. Interruptores, alcances, exclusiones de portada/índice y destinos (`TargetFor`) coinciden con la comprobación.
- Escritura: modifica directamente los XElement del modelo. Los elementos de atributos los inserta `PropertyWriter` en orden de esquema (rPr / pPr / sectPr / tcPr / lvl de numeración), los elementos de extensión desconocidos se conservan en su lugar; los formatos de cierre escriben valores explícitos de desactivación (p. ej. `<w:b w:val="0"/>`) para poder desactivar formatos heredados de estilos; al cambiar fuentes se eliminan las fuentes de tema de la misma ranura. Puntuación, espacios y caracteres especiales calculan posiciones sobre el texto del párrafo completo y luego se mapean a cada `w:t` vía `DocumentModel.PieceText`.
- Estructurales: aceptar revisiones (eliminaciones de marcas de párrafo, celdas eliminadas o combinadas omitidas van a `notes`); eliminar comentarios junto con anclas, extensiones y listas de autores; cancelar hipervínculos externos y eliminar relaciones; eliminar campos de identidad completos; eliminar texto oculto directamente (el oculto por apilamiento de estilos no se elimina, ver evaluación); vaciar encabezados/pies y cubrir líneas con anulaciones sin borde, conservar párrafos con solo números cuando el preajuste permite números (incluidos cuadros de número de WPS), los párrafos conservados con línea se escriben igualmente sin borde, las imágenes ya no referenciadas se quitan del paquete; el color de fondo se elimina directamente; el sombreado escribe «clear, auto» explícito para anular estilos; los párrafos vacíos solo se eliminan sin numeración, sin objetos ni marcadores, no portada, no requeridos entre tablas y sin salto de página previo (directo o por estilo — eliminarlo llevaría el texto a la página anterior; la comprobación los informa por separado como «párrafos vacíos con salto previo»); los párrafos vacíos con un solo salto mueven el salto al final del párrafo anterior antes de eliminarse, manteniendo recuento y paginación; cuando el bloque anterior es tabla, índice, lleva salto de sección o el párrafo ya salta al final (incluidas páginas en blanco por saltos consecutivos), no se mueve; los metadatos eliminan segmentos APP1 / APP13 / COM de JPEG y bloques de texto PNG.
- Saltos manuales (`TextFixes`): divide párrafos en `w:br`, `w:cr` y saltos incrustados en `w:t`; los párrafos siguientes copian el formato original, el salto previo queda solo en el primero y el de sección en el último, las líneas vacías se fusionan al anterior, se quitan espacios iniciales; títulos, párrafos numerados o con cuadros, con campos y saltos dentro de hipervínculos, revisiones u otras envolturas no se dividen, van a `notes`. La división mueve bloques, por lo que se ejecuta tras las correcciones por párrafo.
- Índice (`TocFixes`, solo efectivo cuando `structure.check_toc_present` es forbid): elimina campos de índice (incluidos resultados, campos de número anidados y controles de la galería TOC fuera), entradas de estilo TOC identificadas por campos, índices manuscritos que empiezan con título «××目录 (×× Índice)» seguido de 3 o más líneas iguales a párrafos posteriores (tras quitar guías y números), más títulos adyacentes; los índices manuscritos solo por guías y números sin título no se eliminan, van a `notes`. Cuando el fin de campo cae en un título del cuerpo, solo se elimina el campo y se conserva el título. Los títulos solo reconocidos por índice sin estilos ni niveles reciben sus niveles como niveles de esquema, conservando la estructura. Tras eliminar, se ordena la unión: solo un salto entre los dos bloques, prefiriendo en orden saltos de sección (mover el de la unión al anterior para no dejar párrafos vacíos de una página), salto final del bloque anterior, párrafo de salto más temprano de la unión (también límite de portada), salto inicial del bloque siguiente; se eliminan secciones vacías extra, se corrigen referencias de encabezado/pie al siguiente; se eliminan párrafos vacíos que compartían página con el índice; cuando se pierde paginación se añade salto al final del bloque anterior; entre tablas unidas tras eliminar párrafos se inserta un párrafo vacío.
- Numeración de títulos (`HeadingNumberFixes`, comparte `StructureRules.HeadingNumbers`): la autonumeración problemática cambia su lvl a decimal con isLgl y el texto a «%1.%2» con tantos niveles como el título (conservando sufijo «、»); cuando «índice de nivel − nivel de título» es incoherente en la misma numeración abstracta, o el nivel lo comparte una lista del cuerpo, no se cambia. El primer título arábigo empieza en 1, y títulos anteriores con otra numeración del mismo nivel o superior se tratan como títulos globales y se les quita el número; sin ningún número arábigo, los manuscritos que se expanden nivel a nivel desde el nivel 1 con estilo coherente se renumeran como 1, 1.1, 1.1.1 (sufijo «、» conservado, si no seguido de espacio). Tras cambiar manuscritos, se buscan entradas del índice vía `NormalizeTitle` y se modifican; tras cambiar autonumeración, el índice debe actualizarse en Word, va a `notes`; otros casos mixtos solo van a `notes`.
- Escritura (`DocxWriter`): construye un paquete nuevo en el orden original de entradas zip, solo reserializando las partes modificadas y copiando las demás tal cual.
- Validación y rechequeo: valida original y copia por separado con Open XML SDK, comparando por «tipo de error + parte + elemento»; cuando la copia tiene errores nuevos, se elimina y falla; tras pasar, abre nueva sesión sobre la copia y la vuelve a comprobar, con resultados en `blind-check-fix-result.json` (`fixes` recuentos por regla, `notes`, `validation`, `after` informe, `heading_fallback`). Cuando se eliminó el índice y los títulos se reconocían por índice, el rechequeo no recurre a numeración, `heading_fallback` devuelve false, y Main debe propagarlo en rechequeos, exportaciones y ediciones de esta copia; si no, frases cortas numeradas del cuerpo se reconocerían como títulos e informarían problemas no introducidos por la corrección.

Las dos acciones de revisión por IA en `BlindCheck/Review/` usan la misma solicitud que `blind-check-inspect` (`source`, `profile`, `sensitive_words`, `heading_fallback`):

- `blind-check-dump`: exporta la estructura (texto e `images` de `blind-check-dump.json`). El texto es un párrafo por línea, empezando por el número, marcando niveles, índice, portada, salto previo, saltos y saltos de sección e imágenes contenidas; el texto interno corresponde carácter a carácter al renderizado, solo sustituyendo saltos manuales, tabulaciones y marcadores por ⏎ ⇥ ◇; al inicio lista papel, márgenes, referencias y números iniciales de cada sección, y al final el inventario de imágenes (`img{n}` por aparición, con nombre, texto alternativo, dimensiones y párrafo). Saltos uniformes `\n`.
- `blind-check-edit`: ejecuta `edits` (`{op, target, find, replace}`) sobre `source`, con `original` como documento base de validación. `replace` sustituye una ocurrencia dentro de un párrafo, `find` debe aparecer exactamente una vez en el texto visible, y se rechazan ediciones que crucen saltos, tabulaciones, imágenes, campos u otro contenido no `w:t`; `delete_paragraph` elimina un párrafo entero, `find` debe igualar todo el párrafo (ignorando blancos), no se pueden eliminar párrafos con sección o salto, títulos, índice o único de celda; `clear_image_alt` quita texto alternativo y títulos. El mismo lote usa números de envío para localización (定位) y devuelve resultados por elemento; tras editar valida Open XML contra `original`, revierte todo el lote con errores nuevos, y al pasar sobrescribe `source` y devuelve la nueva estructura (los números cambian tras eliminar).

Al añadir una acción nueva: solo añada el manejo de `action` dentro del asistente; solicitudes y resultados siguen en el mismo directorio, formato de señales sin cambios.

## Arranque de desarrollo

La máquina de desarrollo necesita .NET 10 SDK. Antes de empaquetar Main, primero `dotnet build` y luego lance `bin/Debug/net10.0/openxmlhelper`; no use `dotnet run` (los registros contaminan stdout).

```powershell
dotnet build openxmlhelper\src\OpenXmlHelper\OpenXmlHelper.csproj
```

No suba exes autocontenidos a git.

## Empaquetado

El instalador debe llevar su propio runtime; prohibido depender del .NET local del usuario.

- Publicación: `--self-contained true`, `PublishSingleFile=true`, sin Native AOT ni recorte.
- RID: `win-x64` / `osx-x64` / `osx-arm64`.
- Los nombres de directorio coinciden con las convenciones de herramientas existentes: `win32-x64`, `darwin-x64`, `darwin-arm64`.
- Salida a `client/vendor/openxml-tools/<platform>-<arch>/`, luego electron-builder `extraResources` lo empaqueta en `openxml-tools/<platform>-<arch>/`.
- Ejecute `client/scripts/prepare-openxml-helper.cjs` antes de empaquetar. La CI de Release publica para la plataforma actual.

Ruta de arranque en la app instalada: `resources/openxml-tools/<platform>-<arch>/openxmlhelper(.exe)`.

## Integración del cliente

La exportación completa del documento de licitación reutiliza `render-restricted-html-docx`, con la solicitud conteniendo `html`, `export_format`, `asset_root`, `chrome_assets` y `whole_document: true`. Main ensambla el HTML en memoria cuyo nivel superior usa `section[data-sv-export-template][data-sv-export-page-template]` para marcar estilos y rangos de página, ambos `true` o `false`; los títulos del índice llevan `data-sv-outline-number`, numerados por orden actual, mientras los títulos internos no cuentan para el índice. Son marcas internas de conversión y no se devuelven a los fuentes del agente.

La conversión completa se hace en un solo paquete Word, aplicando formatos base o de plantilla por rango; las definiciones de numeración se aíslan por rango, solo hay nueva sección al cambiar de rango de página, y los rangos sin decoración usan encabezados/pies vacíos explícitos para bloquear herencia. Con marcos de página por capítulo, tras formatear cuerpo, listas, imágenes y tablas de negocio, el contenido entre dos niveles de título se fusiona en una tabla plana; las filas de negocio se unen a la cuadrícula común, conservando combinadas, sin anidar ni repetir encabezados solos. Las subsecciones sin título también se fusionan, sin cruzar rangos de estilo ni secciones de página; las filas pueden dividirse, las imágenes cambian enteras de página o columna. Los títulos quedan siempre como párrafos superiores, `heading_border.include_headings` por defecto y en ausencia es `true`; desactivarlo solo quita bordes, manteniendo sombreado, sangría, navegación y demás. Sin marcos, el doble columna apaisado sigue reutilizando la lógica de primer nivel a todo ancho; el valor inicial de página se escribe una vez.

Los documentos generados declaran modo de compatibilidad 15 en `settings.xml` (`w:compat/w:compatSetting compatibilityMode=15`). Las tablas de negocio a todo ancho y las de marco usan `tblW` uniforme `pct 5000` (100% del ancho de columna), mientras las rejillas se calculan con anchos de exportación, solo como proporciones; cuando el usuario ajusta márgenes en Word, marcos y bordes de título se mueven juntos, y en doble columna se usa ancho de una columna. No quite el modo de compatibilidad ni devuelva anchos a dxa: sin declaración Word maqueta por reglas 2007, los márgenes de celdas porcentuales se suman fuera, y anchos dxa fijos se desalinean con bordes tras cambiar márgenes. docx-editor no lee el modo y convierte porcentajes por ancho del cuerpo; vista previa y auto-chequeo no cambian. Diferencia conocida: Word dibuja bordes externos ~1.45pt más fuera que la norma, docx-editor dibuja por norma; el relleno actual de 115 twips y espaciado de 5pt están calibrados a vista previa alineada, con cajas de título ~1.5pt más anchas por lado que el cuerpo en Word. Las imágenes son de tamaño absoluto; tras agrandar márgenes, las demasiado anchas deben escalarse en Word.

Main usa la cola formal del asistente con esperas de hasta 30 minutos; secciones normales y muestras no pasan `whole_document` y reutilizan la cola de vista previa con la misma lógica de marcos. Las imágenes pasan por el directorio temporal de tránsito, y Main solo escribe al archivo elegido tras conversión exitosa.

Las ilustraciones HTML restringidas se identifican por cabecera como PNG, JPEG, GIF, BMP, WebP, TIFF, EMF, WMF (incluidos WMF ubicable y estándar), con lectura de tamaño y declaración de parte con el mismo formato real, independiente de la extensión; EMF toma rclFrame de cabeceras, WMF toma caja del encabezado ubicable o SetWindowExt, TIFF toma ancho/alto del primer directorio. Las imágenes con extensión y contenido discrepantes se insertan con bytes originales, sin renombrar, transcodificar ni modificar fuentes. Las reconocibles por cabecera pero sin dimensiones se colocan a tamaño de marco sin recortar. Si la cabecera es irreconocible, cuando `asset_types` de la solicitud `render-restricted-html-docx` (declarado por Main en tránsito por extensión vía mime-types, clave `data-sv-asset-ref`) da un tipo `image/*` distinto de los ocho anteriores, se incrusta tal cual a tamaño de marco y lo muestra Word; formatos declarados verificables con cabecera discrepante, o sin declaración, significan no exportable. Una sola imagen no exportable (archivo ausente, formato irreconocible o fallo de lectura) escribe «[图片无法导出：alt (imagen no exportable: alt)]» en su lugar conservando el pie, el resto se convierte con normalidad, y `imageWarnings` de `result.json` devuelve `assetRef` y `reason` por imagen; `insert-body-html` devuelve lo mismo. Ejecute `node scripts/check-technical-plan-export.cjs` para comprobar los ocho formatos, discrepancias, tipos Word, proporciones, reservas, incrustación de desconocidos y avisos en documento completo y secciones.

«Primera página distinta» reserva la portada; la exportación completa aún no integra portada, por lo que `whole_document: true` ignora `first_page_different`: no escribe `w:titlePg` ni crea encabezados/pies en blanco específicos; la primera página sigue las reglas normales de su rango. La configuración de usuario conserva su valor, secciones normales y muestras siguen esa opción.

En el directorio client, `node scripts/check-technical-plan-export.cjs --ipc` comprueba tanto la conversión real como preload, IPC, guardado, progreso y cancelación en una ventana Electron real.

- Rutas: `client/electron/utils/paths.cjs`
- Servicio: `client/electron/services/openXmlHelperService.cjs`
- Herramienta de agente: `client/electron/services/pi/piOpenXmlTool.cjs`
- Salida: cuelga de `ipc/index.cjs` `closeServices()`
- Tareas en cola serie; `ping` expira a los 15 segundos; si el asistente falla, la tarea actual falla y se relanza la próxima vez.
- stderr va a registros de desarrollador con módulo `openxml-helper`.

La autofcomprobación de formato sigue usando la misma acción de documento completo. Main solo inserta párrafos localizadores `SAVIALAYOUT:yb_layout_<número>` antes de cada título de índice y bloque superior de IA en la copia de comprobación; `RestrictedHtmlDocumentRenderer` los elimina antes de formatear e inserta marcadores de ancho cero al inicio de los bloques Word correspondientes. Los marcadores no añaden párrafos ni texto visible; el mapeo lo mantiene Main en memoria sin devolverlo al HTML, y la exportación formal no lleva esas marcas. Para doble columna con primer nivel a todo ancho, las propiedades del cuerpo final también deben ser explícitamente continuas; no confíe en el nextPage implícito, o el último capítulo mostrará un título ocupando solo una página.

## No hacer

- No cambiar a HTTP, gRPC ni tuberías con nombre.
- No meter contenido de documentos ni JSON grandes en señales.
- No hacer que el instalador dependa del .NET del usuario.
- No analizar `.doc` / `.wps`; conviértalos primero a `.docx` antes de pasarlos al asistente.
