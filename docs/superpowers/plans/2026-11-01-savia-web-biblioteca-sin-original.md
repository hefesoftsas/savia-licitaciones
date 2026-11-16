# Entradas de biblioteca sin original

**Objetivo:** conservar las entradas de biblioteca del respaldo incluso cuando falte el documento original, sin presentar el archivo como disponible ni permitir su análisis.

**Diseño:** un motivo de ausencia en `knowledge_documents` distingue estos registros de los documentos con original. La importación crea el registro y sus entradas históricas sin guardar un objeto ficticio en R2. La lista muestra la ausencia y permite consultar las entradas; descarga, análisis y uso como fuente se bloquean. Los reintentos siguen siendo idempotentes y respetan eliminaciones. Las rutas de tareas y búsquedas aceptadas filtran fuentes ausentes. Adjuntar un nuevo original al registro queda como paso posterior.

1. Ampliar pruebas de Miniflare para entradas de originales ausentes, aislamiento, bloqueo de tareas y descarga, reintento y eliminación.
2. Añadir migración y adaptar importación, consultas, CLI e interfaz con estados claros.
3. Verificar suites, builds y runner empaquetado. No desplegar.

**Estado:** las entradas históricas de documentos sin original se conservan y muestran con su motivo de ausencia. Las rutas de descarga, selección y análisis no los tratan como fuentes disponibles. El usuario puede adjuntar un archivo tras confirmar que debe verificar su correspondencia; las entradas siguen siendo históricas. La revisión visual en navegador está deshabilitada en este entorno.
