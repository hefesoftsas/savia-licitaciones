# Carga de documentos grandes desde navegador

**Objetivo:** permitir subir documentos de proyecto mayores que el límite práctico de una petición Cloudflare, sin cargar el archivo completo en memoria ni duplicarlo al reintentar.

**Diseño:** el navegador divide archivos mayores de 50 MiB en partes de 10 MiB (máximo 1 GiB). Un endpoint de sesión y mismo origen crea una carga multipart de R2 con un identificador firmado y temporal vinculado a la cuenta, proyecto y clave de idempotencia. El servidor verifica el tamaño de cada parte y calcula SHA-256 del objeto completo antes de publicar el archivo y su recibo en una transacción D1. Un reintento transfiere y verifica de nuevo antes de devolver un recibo previo; no restaura archivos eliminados. Ante fallo se aborta y se limpia el staging; el vencimiento de multipart abandonados requiere la política de R2. La ruta de archivos pequeños permanece compatible. No se activan servicios nuevos ni se despliega.

1. Probar en Miniflare el protocolo autenticado entre dos usuarios, partes, reintentos, alteración, eliminación, aborto y fallos de almacenamiento.
2. Implementar servicio y rutas, reutilizando la tabla de recibos web y staging, sin alterar importaciones del runner.
3. Conectar transferencia secuencial desde `File.slice()` con reintentos y cancelación del multipart; mostrar límites y errores existentes. Probar el navegador mediante transporte simulado, build y recorrido completo con Miniflare.

**Avance:** la carga web usa partes para archivos mayores de 50 MiB y muestra progreso y verificación. Miniflare probó un archivo de 50 MiB más un byte, incluida la función del navegador, cuentas aisladas, origen y firma, aborto, reintentos, contenido cambiado y eliminación. Las compilaciones web y de escritorio pasan. El límite de 1 GiB es de aplicación y todavía no se ha medido el recorrido en Cloudflare real, ni se ha probado el máximo o la interfaz visual. Una interrupción completa reinicia la carga; R2 conserva multipart incompletos hasta su vencimiento. No se ha desplegado.
