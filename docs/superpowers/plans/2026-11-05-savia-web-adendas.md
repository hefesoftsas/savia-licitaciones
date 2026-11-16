# Adendas: paridad web y migración

**Objetivo:** conservar y revisar los análisis de impacto del escritorio y permitir nuevos análisis desde la web con Pi y el runner local, sin activar ejecución alojada.

1. Inspeccionar `addendum_impact_runs` y `addendum_impact_reviews` por proceso desde la copia de escritorio, conservando fuentes, resultados y notas; identificar tareas que quedaron en ejecución como interrumpidas y no asociar procesos ambiguos. Probar esquemas previos, múltiples procesos y registros dañados. La inspección aún debe declarar estos datos como omitidos en la importación.
2. Diseñar almacenamiento web aislado por proyecto con importación idempotente, conservación de identificadores de origen, revisión histórica explícita y validación de citas y fuentes; incorporar captura y restauración de proyecto antes de dejar de declarar datos omitidos.
3. Conectar la importación de planes y licitaciones, y mostrar el historial, notas y estado de fuentes en español e inglés. Verificar aislamiento, datos faltantes, concurrencia, interrupciones y runner empaquetado.
4. Adaptar el análisis del escritorio a una tarea Pi del runner con fuentes y consentimiento explícitos, citas contrastadas y cancelación; conservar resultados revisables sin aplicar acciones automáticamente. Cubrir el recorrido completo en Miniflare y verificar compatibilidad de la vista con la aplicación existente.

## Evidencia y pendientes (2026-11-05)

- Inspección de escritorio, API histórica aislada por proyecto, transferencia desde planes y licitaciones y vista de lectura conectadas. No se eliminó `addendum-impact` del aviso de omisiones: faltan captura/restauración del proyecto, revisión web y análisis nuevo con Pi.
- Distribución local verificada: `/tmp/savia-runner-addendum-review-20261105`. Sus 30 pruebas de CLI de respaldos pasan; su módulo de transferencia también pasa la integración con Miniflare, incluido historial de 50 análisis, reintentos y conflictos.
- La prueba de 50 análisis detectó un HTTP 500 por la cantidad de parámetros de la guarda SQL. Se sustituyó por `json_each` con dos parámetros y el mismo caso pasó.
- Límite actual explícito: 50 análisis, 256 KiB por registro y 900000 bytes de historial por importación. Los historiales fuera de límite se informan como no transferidos; no se truncan. Ampliar mediante transferencia por partes para completar la paridad de respaldos grandes.
- La interfaz actual solo consulta el historial. No afirma vigencia ni verificación de citas, ni permite aplicar cambios automáticamente.

Captura de historial (avance): el origen de snapshot incluye los registros de adendas en la revisión; el runner añade `project-addendum-history` como extensión final y restaura por el importador idempotente existente. Se preservan notas y errores de parseo; historias fuera de los límites actuales detienen la captura en vez de truncarse. Pruebas focalizadas de captura Miniflare (2) y validación/restauración (3) pasaron. Pendiente prueba completa archivo→nuevo proyecto y runner empaquetado antes de declarar cerrada esta parte. Trabajo interrumpido por correcciones solicitadas de UI/caché.
