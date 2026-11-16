# Importación SECOP con memoria acotada

La descarga directa de documentos SECOP debe conservar el límite de 50 MiB, verificar la firma del formato y el origen fijo, y publicar un archivo solo tras completar la descarga. Sustituir la acumulación completa por carga multipart a R2 con partes de 5 MiB, cancelar cargas fallidas o sobredimensionadas y utilizar staging durable para limpiar objetos si falla o se interrumpe la operación. Mantener el comportamiento idempotente ante importaciones simultáneas. ZIP continúa en el runner existente. Las pruebas usan fuentes simuladas y Miniflare: no constituyen mediciones del servicio o memoria reales de Cloudflare.

- [x] Probar envío incremental, límite, firma, errores y limpieza, además de la ruta SECOP de Miniflare.
- [x] Implementar multipart con staging y comprobar los comportamientos existentes sin desplegar.

Las pruebas incluyen carga real de 6 MiB en Miniflare, cancelación por límite tras iniciar multipart, fallo del origen, importaciones concurrentes y limpieza. No se han medido límites, memoria ni costos en Cloudflare real.
