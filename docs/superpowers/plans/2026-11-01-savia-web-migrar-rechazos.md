# Migrar revisiones de causales de rechazo

**Objetivo:** trasladar las revisiones históricas de rechazo del escritorio a la cuenta web conservando hallazgos, textos procesados e imágenes disponibles del respaldo.

**Diseño:** el runner lee las tablas `rejection_check_*` y resuelve rutas relativas solo dentro del respaldo; señala documentos y referencias de imagen ausentes. El protocolo de revisiones importadas distingue explícitamente rechazo y duplicados tanto en consultas como en reintentos y eliminación. Cada archivo se transfiere con recibo idempotente y el informe puede revisarse y descargarse desde la web. Los originales que el escritorio no respaldó se indican como ausentes. El contenido es histórico, sin reanudar tareas ni inferencia.

1. Probar extracción de hallazgos, rutas Windows, imágenes, archivos faltantes y respaldos antiguos.
2. Incorporar separación por tipo al almacenamiento y las rutas, con aislamiento, recuperación y eliminación segura.
3. Conectar runner e interfaz es/en; probar transferencia, reintentos, concurrencia y prohibición de mezclar tipos en Miniflare.
4. Verificar compilaciones y distribución del runner; no desplegar.

**Estado:** la importación y consulta históricas conservan hallazgos, textos e imágenes disponibles, registran faltantes y permiten reintentar o eliminar. Las rutas aíslan las revisiones de rechazo de duplicados y de otras cuentas. Los originales externos pueden adjuntarse después. La ejecución de nuevas revisiones y la revisión visual permanecen pendientes.
