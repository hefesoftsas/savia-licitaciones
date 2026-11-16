# Restauración de archivos grandes de proyecto

**Objetivo:** recuperar archivos de proyecto mayores de 25 MiB sin cargarlos completos en memoria ni reducir la comprobación de integridad.

**Diseño:** ampliar la importación autenticada existente con una ruta de flujo para cuerpos de longitud conocida de hasta 50 MiB, usando la suma SHA-256 de R2 y el registro de staging y recibo idempotente existentes. El runner lee desde disco con tamaño fijo y vuelve a comprobar el resultado mediante el servidor. Las capturas anteriores y la ruta pequeña no cambian. El tamaño de cada recurso de biblioteca y de plan conserva su límite propio. Este paso no elimina la necesidad de una carga multipart para capturas aún mayores.

**Verificación:** prueba en Miniflare para un archivo mayor de 25 MiB, hash incorrecto, reintento y aislamiento; comprobar que no se publica ningún archivo alterado. Ejecutar el recorrido con el runner empaquetado y las pruebas de limpieza de staging.

**Estado:** implementado para archivos de proyecto de hasta 50 MiB, con envío desde disco y comprobación de longitud y SHA-256 en R2. Los reintentos consumen y verifican el cuerpo antes de devolver el recibo existente; no vuelven a crear archivos eliminados. Miniflare y el runner empaquetado probaron recuperación, reintento, contenido alterado, longitud incorrecta y aislamiento entre cuentas. Las cargas más grandes y otros tipos de recurso siguen pendientes.
