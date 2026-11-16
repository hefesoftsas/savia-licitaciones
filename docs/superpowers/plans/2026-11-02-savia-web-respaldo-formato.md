# Recuperación de formato y plantillas de exportación

**Objetivo:** permitir capturar y recuperar las preferencias de formato Word y las plantillas personales de una cuenta web.

**Diseño:** una lectura autenticada por runner devuelve únicamente el formato guardado y las plantillas personales con una revisión derivada del contenido y de sus versiones. El runner escribe una captura parcial verificada y contrasta la revisión al terminar. La restauración valida toda la captura antes de escribir y reutiliza los recibos de importación existentes, con identificador estable derivado de la captura; no sobrescribe el formato existente ni recrea plantillas eliminadas. No incluye plantillas del sistema, credenciales ni otras áreas de la cuenta.

- [x] Cubrir con Miniflare autenticación y aislamiento, captura, cambios simultáneos, corrupción, reintento, conflicto y eliminación.
- [x] Implementar la lectura acotada y el transporte de captura/restauración, integrarlo en el CLI y en el paquete del runner.
- [x] Verificar las pruebas y documentar el alcance y límites, sin desplegar.

La captura y restauración se verificaron con Miniflare; los archivos no están cifrados y no constituyen una copia completa.
