# Exportar revisiones de duplicados a Excel

**Objetivo:** permitir compartir una revisión web en un libro de Excel comparable al del escritorio.

**Diseño:** construir el libro en el navegador a partir del informe completo ya consultado, sin subirlo nuevamente ni usar inferencia. Incluir resumen, metadatos, estructura, similitud entre archivos, frases e imágenes con sus ubicaciones y contexto. Conservar los textos como celdas literales, señalar cualquier truncamiento requerido por Excel y mantener la descarga JSON sin pérdida. Los nombres disponibles se resuelven por ID y los documentos retirados se identifican por su ID. La exportación se genera en el idioma de la interfaz.

1. Probar el libro en español e inglés con datos reales representativos, fórmulas como texto, ubicaciones y celdas largas mediante lectura de vuelta.
2. Integrar la generación bajo demanda y notificar errores; conservar la descarga JSON.
3. Ejecutar pruebas y compilaciones; verificar la interfaz cuando el navegador esté disponible.

**Estado:** exportación de seis hojas en español e inglés implementada; los porcentajes conservan formato y los textos que Excel no puede contener se indican como truncados. El JSON completo sigue disponible. Los informes nuevos conservan nombres de origen incluso si los documentos se retiran. Las pruebas leen el libro generado y verifican contenido, fórmulas literales y ubicaciones; la revisión visual en navegador sigue pendiente.
