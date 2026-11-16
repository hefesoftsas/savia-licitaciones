# Captura del perfil de empresa y sus imágenes

Preparar una captura parcial por cuenta del perfil de empresa y sus imágenes originales, sin credenciales ni datos de otras cuentas. El perfil puede no estar guardado aunque existan imágenes; la recuperación debe conservar esa situación y no sustituir un perfil de destino existente. Detectar cambios de D1 o R2 observados durante la transferencia y rechazar eliminaciones incompletas.

1. Construir un transporte autenticado de perfil e imágenes con versiones por archivo, ETag y pruebas de aislamiento, cambios y ausencias.
2. Añadir validación, captura por flujo y recuperación idempotente con identificadores nuevos, sin recrear imágenes eliminadas. Soportar imágenes sin perfil guardado sin crear uno artificialmente.
3. Probar restauración entre cuentas, interrupciones, concurrencia, perfiles de destino existentes y runner empaquetado. La captura debe describirse como parcial y no cifrada; no desplegar ni usar inferencia.

**Avance:** se implementaron los comandos de captura y recuperación, recibos independientes, integridad previa a la escritura, aislamiento y recuperación de imágenes sin crear un perfil artificial. Miniflare cubre el recorrido autenticado entre cuentas, los reintentos, la eliminación posterior y la protección de perfiles existentes. La captura es parcial y no está cifrada; D1 y R2 no forman una transacción conjunta. El ETag de R2 controla la versión, mientras que la captura calcula un hash propio.
