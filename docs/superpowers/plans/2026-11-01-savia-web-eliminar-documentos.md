# Retirar documentos de un proyecto web

**Objetivo:** permitir retirar documentos del proyecto sin perder el rastro de limpieza de R2 ni restaurarlos silenciosamente al reintentar una importación de escritorio.

**Diseño:** una transacción D1 copia metadatos y clave de objeto a `project_file_deletions` y retira `project_files`; los cálculos existentes que verifican fuentes dejan de ver el documento inmediatamente. El registro duradero permite reintentar la limpieza y distingue documentos retirados de documentos nunca importados. Una concesión existente ya no descarga el archivo, aunque una tarea que lo haya descargado puede continuar. Los trabajos históricos y el texto generado se conservan. Un reintento de importación comunica el documento retirado, sin volver a crearlo. La interfaz confirma y muestra limpiezas pendientes sin ofrecer descarga ni selección.

1. Pruebas Miniflare: propietario, origen, archivos de otro usuario, fuentes, reintento, documento importado y datos conservados. Prueba específica de fallo de R2 y reintento.
2. Añadir migración y transacción con limpieza idempotente; adaptar el recibo de importación y el runner.
3. Añadir interfaz es/en, deselección y confirmación; verificar build, suites afectadas y distribución. No desplegar.

**Estado:** eliminación y reintento implementados; las pruebas cubren error de R2, reversión D1, aislamiento, tarea con concesión, análisis conservado y reimportación. Falta la inspección visual en navegador, deshabilitado en este entorno.
