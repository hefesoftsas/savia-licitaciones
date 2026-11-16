# Recuperación parcial de la biblioteca de imágenes

Capturar imágenes de la biblioteca compartida mediante el runner autenticado, con revisión D1 y ETags de R2, sin atribuir consistencia atómica a servicios distintos. Conservar los registros de originales ausentes y rechazar eliminaciones pendientes u objetos inesperadamente ausentes. La restauración comprobará todos los metadatos y hashes antes de escribir, usará recibos idempotentes existentes y no recreará imágenes eliminadas tras la primera importación. La captura sigue siendo parcial, sin cifrado ni credenciales.

1. Comprobar en Miniflare aislamiento, integridad, originales ausentes y reintentos en otra cuenta.
2. Añadir transporte autenticado y captura/recuperación al runner; validar cambios concurrentes y archivos corruptos.
3. Integrar comandos y documentación; verificar pruebas focalizadas y distribución cuando sea posible, sin desplegar ni activar runner alojado.

**Estado:** transporte y comandos implementados; Miniflare verifica cuentas, cambios de objeto durante la captura, corrupción, faltantes, reintentos y eliminaciones. La distribución preliminar macOS ARM64 se construyó y pasó el diagnóstico y el recorrido completo con Miniflare. No se ha probado Cloudflare real ni se han medido los límites y costos con bibliotecas grandes. Las comprobaciones no crean una instantánea atómica.
