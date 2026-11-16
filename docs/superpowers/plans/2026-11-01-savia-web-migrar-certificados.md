# Importación de certificados del escritorio

**Objetivo:** llevar los registros de certificados de un respaldo verificado a la cuenta web, sin sobrescribir ediciones posteriores y sin restaurar eliminaciones.

**Diseño:** el runner lee `credential_library_certificates` y transfiere las imágenes vinculadas que estén disponibles, con recibos independientes. Por cada registro calcula un identificador de origen y lo envía con un recibo por respaldo y certificado. La API inserta datos y recibo en una transacción, conserva incluso valores históricos incompletos o no vigentes y rechaza contenido distinto bajo el mismo recibo; el borrado conserva el recibo. La inspección y el resultado muestran cantidades, nunca números de certificado ni sus nombres. Los vencimientos válidos aparecen en agenda mediante la lógica existente. Las imágenes ausentes o incompatibles se declaran explícitamente.

1. Probar respaldo real, datos antiguos y conteos sin revelar contenido; verificar importación, aislamiento, concurrencia, reintentos, edición y eliminación.
2. Implementar lector, CLI y API transaccional, incorporando mensajes claros para imágenes pendientes.
3. Verificar runner empaquetado, Miniflare, compilaciones y documentación; no desplegar.

**Estado:** registros y valores históricos se importan con recibos por certificado. Miniflare verifica reintentos, concurrencia, fallos de transacción y aislamiento. Las imágenes disponibles también se transfieren con recibos independientes; se informan las no disponibles.
