# Aceptación de análisis importados

**Objetivo:** permitir que el usuario revise y utilice en el índice tres análisis de escritorio equivalentes a categorías web, identificando explícitamente los documentos disponibles y sin inventar tareas de IA.

**Diseño:** ampliar la tabla de análisis aceptados para admitir, además de la referencia a una tarea real, una identidad de revisión y los documentos elegidos. Migrar las filas existentes sin alterar sus identificadores. Aceptar únicamente `projectOverview`, `techRequirements` y `responseFileRequirements` en sus categorías correspondientes. El usuario revisa el contenido, selecciona documentos y confirma que sus fuentes originales podrían diferir; la API verifica huella de documentos, huella del respaldo, revisión de análisis y pertenencia. Los generadores comprueban versión y referencia de tarea o revisión, y leen exactamente las mismas categorías aceptadas. Los demás análisis siguen como históricos consultables.

**Condiciones:** no crear trabajos artificiales; compatibilidad con tareas y sesiones ya existentes; no sobrescribir sin confirmación; no perder capítulos; rechazar selecciones o documentos cambiados; aislamiento por cuenta; HTML no confiable desactivado; no desplegar ni ejecutar IA.

**Pruebas:** migración con análisis previos; aceptación de las tres categorías y generación de contexto del índice; rechazo de documento ajeno, fuente modificada, revisión caducada, estado fallido o categoría no equivalente; sustitución por tarea real y viceversa; protección de tareas del índice iniciadas antes de cambios; suites API/runner y compilaciones.

**Estado:** implementadas las tres categorías y la confirmación con documentos visibles, incluido el resumen guardado en metadatos de respaldos antiguos. Probada la migración con filas antiguas en SQLite y D1 emulado, y el contexto del índice con análisis revisados y generados mezclados. Una prueba inicial usaba opciones incompatibles con la versión de Miniflare; se corrigió y volvió a pasar. La revisión visual manual sigue pendiente por la configuración del navegador integrado.
