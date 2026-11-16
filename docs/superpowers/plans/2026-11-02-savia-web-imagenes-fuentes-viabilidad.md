# Imágenes en fuentes de viabilidad

- Extraer imágenes compatibles de DOCX y PDF en el runner local junto con el texto, sin inferencia ni descarga externa; avisar de los límites del conversor y formatos no cubiertos.
- Guardar las imágenes por cuenta, tarea y fuente con referencias al texto; hacerlas visibles solo cuando la extracción se complete y la fuente siga seleccionada.
- Controlar integridad, reintentos y cantidad antes de publicar; probar archivos reales, aislamiento, cargas incompletas y runner empaquetado con Miniflare.

**Estado:** la extracción conserva imágenes compatibles y la web muestra una referencia para pegarlas en capítulos. La exportación Word entrega al runner las imágenes referenciadas de fuentes seleccionadas y extracciones completadas, con comprobación de cuenta, versión y concesión. Miniflare probó aislamiento, cancelación y entrega al exportador. Una prueba de extremo a extremo extrajo una imagen de un DOCX real, la incorporó al informe y verificó sus bytes dentro del Word generado; también pasó con la distribución preliminar del runner en macOS ARM. Quedan pendientes la revisión visual y las pruebas en otras plataformas.
