# Migración de documentos grandes del escritorio

Los respaldos de escritorio ya se verifican completos en memoria con un límite total de 256 MiB, pero `import-plan` descarta originales mayores de 25 MiB. Conservar los originales admitidos por el formato del respaldo y reutilizar el transporte de proyecto existente: carga directa hasta 25 MiB, flujo de 25 a 50 MiB y partes de 10 MiB por encima. Los recibos y el SHA-256 deben conservar la idempotencia y no recrear archivos eliminados. Mantener el límite total actual del formato y no afirmar soporte de archivos de 1 GiB en respaldos de escritorio.

1. Probar extracción del respaldo y transferencia de tamaños superiores a 25 y 50 MiB, reintentos, originales retirados y contenido alterado.
2. Reutilizar las rutas existentes con propiedad de cuenta y limpiar recursos temporales o flujos en errores; no modificar el archivo de respaldo.
3. Verificar el comando real con Miniflare y aislamiento; documentar límites y ejecutar pruebas enfocadas sin desplegar ni activar ejecución alojada.

**Avance:** el comando importa originales de más de 25 y 50 MiB con los transportes existentes. Miniflare comprobó el comando real con dos cuentas, hashes descargados, reintento y eliminación posterior; el mismo recorrido pasó con una distribución independiente en macOS ARM64. También pasaron las pruebas de restauración de capturas web que usan el transporte compartido. Durante la integración se detectó que el encabezado de longitud explícito fallaba con la combinación local de Node y Undici; se retiró de ambos recorridos, conservando la verificación de tamaño en el Worker. La prueba no demuestra límites ni comportamiento en Cloudflare real o Windows. El respaldo de escritorio mantiene el límite total de 256 MiB y se descomprime en memoria.
