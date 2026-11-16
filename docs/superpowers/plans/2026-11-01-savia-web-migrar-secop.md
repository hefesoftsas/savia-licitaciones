# Migración del vínculo y seguimiento SECOP

**Objetivo:** conservar la licitación y sus cambios históricos al importar un plan vinculado del escritorio.

**Diseño:** el lector usa el `process_id` real del contexto del plan y busca la misma clave en `secop_saved_processes`, `secop_watch_baselines` y `secop_watch_alerts`. Solo vincula registros SECOP I o II con identidad consistente; no deduce vínculos a partir del identificador sintético `active`. Una operación independiente con recibo asocia el proceso al proyecto ya importado y guarda línea base y avisos en una sola transacción, antes de que el seguimiento automático pueda establecer otra línea base. Una asociación o seguimiento existente produce conflicto sin sobrescribir. Los reintentos no revierten cambios ni recrean asociaciones retiradas. No se consultan fuentes públicas durante la importación. Las licitaciones guardadas que no tienen un plan asociado requieren una migración independiente.

1. Probar asociación exacta, datos históricos, avisos revisados, aislamiento, concurrencia, reintentos y ausencia de inferencias sobre vínculos.
2. Implementar lectura, API transaccional y transferencia del runner; verificar conflictos y fallos.
3. Documentar y ejecutar pruebas con runner empaquetado y Miniflare. No desplegar.

**Estado:** el vínculo y seguimiento de planes asociados se importan de forma atómica, conservando avisos y revisiones. Se informan portafolios incompatibles y conflictos. Las copias guardadas sin plan asociado pueden importarse mediante un comando independiente; las asociaciones ambiguas se informan.
