# Recuperación de copias anónimas grandes

Permitir que las capturas parciales de proyectos con copias DOCX corregidas mayores de 25 MiB se puedan crear y restaurar. Mantener límite de 25 MiB para informes JSON y admitir copias DOCX de hasta 1 GiB. Verificar el manifiesto y SHA-256 por flujo, sin cargar la copia completa en memoria.

El runner sube la copia por partes a un staging asociado a la cuenta, proyecto importado y tarea de origen. El servidor verifica tamaño, hash y firma DOCX antes de emitir un comprobante firmado de corta duración. La importación existente consume ese comprobante en la misma transacción que crea tarea y artefacto; conserva remapeos, recibos idempotentes y eliminaciones. Una carga o importación fallida deja staging para limpieza y los multipart inconclusos caducan en R2. No convertir esta captura en respaldo completo ni desplegar.

1. Probar staging autenticado, integridad, aislamiento, expiración y reintentos; conectar al importador sin modificar el comportamiento de archivos pequeños.
2. Adaptar la validación local y el transporte del runner a archivos grandes por flujo y preservar reintentos y estados de eliminación.
3. Probar captura y restauración entre cuentas con Miniflare y runner empaquetado, incluidos reintentos, corrupción y regresión de capturas anteriores.

**Avance:** la captura y restauración entre cuentas verifican las copias grandes por flujo y conservan vínculos, recibos y eliminaciones. Miniflare probó un DOCX de 25 MiB más un byte, hash incorrecto, aislamiento, firma, reintentos y limpieza; el recorrido completo pasó también con el runner empaquetado. Se mantienen compatibles las capturas anteriores. No se ha probado 1 GiB, el entorno Cloudflare real ni una restauración completa de cuenta; la captura es parcial y no está cifrada. Si se pierde la confirmación de staging, una repetición vuelve a subir las partes y los multipart abandonados caducan en R2.
