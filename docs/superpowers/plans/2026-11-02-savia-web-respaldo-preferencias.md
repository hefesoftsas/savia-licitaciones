# Recuperación parcial de preferencias de cuenta

Capturar las cuatro preferencias de apariencia e idioma mediante un runner emparejado de la cuenta, con el formato de captura parcial existente. No incluir identidad, credenciales ni presentar esta captura como respaldo completo.

La recuperación solo modifica la cuenta del runner de destino. Exige la revisión explícita observada en el destino y actualiza con una condición atómica; cualquier cambio posterior invalida la operación. Las actualizaciones normales incrementan la revisión. Las capturas se verifican antes de enviar datos. Probar con Miniflare cuentas separadas, capturas alteradas y conflicto de revisión; mantener el runner alojado desactivado.
