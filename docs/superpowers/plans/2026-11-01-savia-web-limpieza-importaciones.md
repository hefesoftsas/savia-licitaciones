# Recuperación de cargas interrumpidas de importación

**Objetivo:** registrar los objetos temporales de R2 antes de cargarlos y permitir su limpieza segura y reanudable tras fallos o interrupciones.

**Arquitectura:** D1 conserva un registro por intento con propietario, clave única y concesión temporal. La transacción que vincula archivo y proyecto retira el registro al terminar. Un limpiador autenticado por runner reclama registros expirados o fallidos, verifica que ninguna fila de archivo los use, elimina R2 y conserva el registro si falla. Si no hay confirmación de que la escritura terminó, mantiene un registro de vigilancia y vuelve a revisar en una ejecución posterior transcurridas 24 horas; no supone un límite de duración de la petición. Si la escritura termina durante la limpieza, vuelve a eliminar antes de retirar el registro. Se ejecuta al reintentar una importación y bajo demanda; no crea cron ni cómputo alojado.

**Condiciones:**
- No limpiar cargas con concesión vigente ni objetos registrados en `project_files`.
- Aislamiento por cuenta, reclamación atómica, recuperación tras fallo de limpieza y límite por lote.
- Una carga que perdió su concesión no puede registrar ni sobrescribir archivos.
- La migración conserva la idempotencia y la limpieza inmediata tras errores.
- Los registros cubren intentos creados por esta versión; no identificar automáticamente objetos históricos sin registro.

**Verificación:**
1. Miniflare: objeto expirado, activo, referenciado y de otra cuenta; idempotencia, concurrencia y recuperación del limpiador.
2. Simular fallos de R2/D1 y confirmar que el registro persiste hasta borrar R2; comprobar limpieza normal y cargas simultáneas.
3. Comando del runner para limpieza manual y ejecución oportunista en cada importación; verificar salida sin contenido privado.
4. Suites API/runner y comprobación de distribución; no desplegar.
