# Migración de la biblioteca de conocimiento

**Objetivo:** trasladar carpetas, originales y entradas guardadas en la biblioteca de escritorio a la cuenta web, preservando fuentes y sin convertir contenidos generados en citas verificadas.

**Diseño:** el lector del respaldo consulta `knowledge_folders`, `knowledge_documents` y `knowledge_items`, y resuelve originales exclusivamente bajo `workspace/knowledge-base/`. El comando `import-knowledge` crea carpetas y documentos con recibos por respaldo y origen; los reintentos no sobrescriben cambios ni recrean documentos eliminados. Los originales se guardan en R2 con staging recuperable. Las entradas históricas se conservan como datos separados y consultables, con su título, resumen, contenido y fuente original; no se incorporan automáticamente al índice aceptado que exige citas verificadas. Se informa de archivos ausentes, inseguros o demasiado grandes, sin leer fuera del respaldo.

1. Pruebas de lectura de carpetas y documentos, orden, rutas Windows/Unicode, entradas y originales ausentes o inseguros.
2. Pruebas Miniflare de aislamiento, reintentos, eliminación, datos históricos y limpieza ante fallo; implementar recibos y cargas.
3. Integrar CLI e interfaz de consulta histórica en español e inglés; verificar runner empaquetado, builds y documentación. No desplegar.

**Estado:** originales disponibles, carpetas y entradas históricas se transfieren mediante el runner; se conservan separados del índice aceptado. Cuando el original falta, las entradas se conservan y el registro muestra el motivo sin ofrecer descarga ni análisis. El usuario puede adjuntar un archivo posteriormente tras verificarlo. Reintentos respetan eliminaciones. El orden manual de carpetas y documentos se conserva al importar y puede ajustarse desde la web. Falta la revisión visual en navegador y la migración de otros datos de procesamiento de biblioteca.
