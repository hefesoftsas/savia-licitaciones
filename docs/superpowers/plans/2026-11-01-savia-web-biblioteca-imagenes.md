# Biblioteca de imágenes web

**Objetivo:** permitir cargar, consultar y retirar imágenes de la biblioteca e importar los originales del respaldo de escritorio.

**Diseño:** D1 conserva el catálogo privado y R2 los originales. Las cargas usan staging durable; las eliminaciones marcan el registro y permiten reintentar R2 antes de retirarlo. El runner lee únicamente archivos de `workspace/imported-images/library` referenciados por SQLite, conserva nombre y orden, y registra explícitamente archivos ausentes o incompatibles. Recibos por respaldo e imagen evitan duplicados y recreaciones tras eliminaciones. No se modifican referencias de imágenes ya importadas en planes.

1. Probar cargas, descarga, aislamiento, borrado y recuperación en Miniflare; verificar idempotencia y rutas inseguras de respaldos reales.
2. Implementar API, staging, limpieza y migración local.
3. Integrar interfaz es/en, verificar compilaciones y runner empaquetado. No desplegar.

**Estado:** biblioteca, migración y adjunto posterior implementados. Pasaron 23 pruebas de integración y regresión, 20 pruebas con el runner empaquetado y las compilaciones de escritorio y web. Las pruebas cubren aislamiento, imágenes ausentes o incompatibles, fallos D1/R2, concurrencia y eliminación durante una carga. La revisión visual sigue pendiente porque el navegador no está disponible en esta sesión.
