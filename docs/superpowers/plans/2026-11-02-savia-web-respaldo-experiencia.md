# Captura y recuperación de experiencia empresarial

Capturar proyectos e imágenes de experiencia de la cuenta mediante lectura autenticada al runner, rechazando eliminaciones en curso, objetos ausentes y cambios detectados mediante ETag y revisión de D1. Recuperar con los recibos de importación existentes, validando todos los metadatos y hashes antes de escribir. Conservar datos y categorías, orden e imágenes; los reintentos no deben sobrescribir cambios ni recrear elementos eliminados. La captura es parcial, legible y no contiene credenciales ni otros datos de cuenta. Las tareas activas no se restauran y D1/R2 no forman una instantánea conjunta.

- [x] Prueba Miniflare: cuentas aisladas, cambios y corrupción, interrupción, imágenes y reintentos sin recrear registros.
- [x] Integrar la captura y recuperación al runner y su distribución; documentar límites.

Las pruebas con Miniflare incluyen cambios durante la captura, corrupción, interrupción y reintentos, y se ejecutaron con el runner empaquetado para macOS ARM64. No se ha comprobado en Cloudflare real ni en Windows/Linux.
