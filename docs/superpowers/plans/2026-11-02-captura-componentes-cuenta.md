# Captura coordinada de componentes de cuenta

**Objetivo:** permitir capturar en una sola operación los componentes de cuenta que ya tienen transporte y verificación independientes, como paso hacia una recuperación integral. La captura sigue siendo parcial: no incluye proyectos, credenciales ni otros datos no cubiertos; cada componente se obtiene en momentos diferentes y no existe una instantánea conjunta D1/R2.

1. Probar un coordinador con capturadores simulados: directorio nuevo exclusivo, componentes en orden fijo, sin credenciales en el índice, conservación de capturas terminadas si falla una posterior y ausencia de índice de éxito en caso de error.
2. Implementar el coordinador con los capturadores existentes y un índice final explícitamente parcial. No reemplazar ni borrar archivos existentes y no afirmar consistencia entre componentes.
3. Añadir el comando al CLI y al paquete, documentar qué incluye y qué omite, y probar con Miniflare y dos cuentas el recorrido con datos sintéticos. La restauración coordinada y los proyectos permanecen pendientes.

**Estado:** `capture-account-components` captura diez componentes existentes en subcarpetas independientes. Un índice final, publicado sin reemplazar otro archivo, identifica el conjunto como parcial y no atómico. Si falla un componente, se conservan los anteriores sin publicar el índice. Las pruebas con Miniflare y el runner empaquetado en macOS comprobaron cuentas separadas, un objeto R2, preferencias distintas y revocación. El conjunto no está cifrado, no incluye proyectos ni credenciales y todavía no se restaura de forma coordinada; tampoco se ha probado el paquete en Windows o Linux.

**Actualización:** la recuperación coordinada de este conjunto ya está disponible; sus condiciones y pruebas se describen en `2026-11-02-restaurar-componentes-cuenta.md`. La recuperación sigue siendo parcial.
