# Captura y recuperación de seguimientos PAA

Capturar seguimientos y alertas de la cuenta autenticando al runner. La lectura reúne las filas de D1 y genera una revisión que detecta cambios observados antes de publicar la captura. Validar cada plan, encabezado y alerta antes de escribir. Recuperar cada seguimiento con los recibos idempotentes existentes, conservando alertas y estado revisado; rechazar conflictos, no recrear seguimientos eliminados y permitir reintentos tras interrupciones. Una restauración con varios seguimientos puede quedar parcialmente aplicada si otro seguimiento entra en conflicto. La captura es parcial, legible y no contiene credenciales ni otros datos de cuenta.

- [x] Pruebas Miniflare: aislamiento, revisiones y alertas, corrupción, cambios concurrentes, conflictos y reintentos.
- [x] Integrar API, CLI y paquete, y documentar sus límites.

Las pruebas con Miniflare incluyen interrupción y reintentos, y se ejecutaron los comandos del runner empaquetado en macOS ARM64. No se ha probado en Cloudflare real ni en Windows/Linux.
