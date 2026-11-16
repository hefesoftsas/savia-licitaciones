# Captura parcial del RUP vigente

Capturar el certificado RUP vigente y sus datos revisados mediante el runner propietario, comprobando cambios observados en D1 y ETag de R2. Verificar todo el PDF y las referencias de página antes de importar. Restaurar con los recibos existentes, sin reemplazar un RUP vigente del destino ni duplicar al reintentar. Una cuenta sin certificado produce una captura vacía sin borrar datos de destino. La captura no incluye otros datos ni credenciales, no está cifrada y no es una instantánea atómica.

Verificar en Miniflare el aislamiento, cambios concurrentes, corrupción, recuperación y reintentos; integrar y comprobar también el runner empaquetado. No desplegar ni activar servicios alojados.

**Estado:** captura y recuperación implementadas con PDF validado antes de crear datos, aislamiento por cuenta y recibos de importación. Miniflare comprobó la ausencia de fuentes, cambios de hechos, corrupción, cuentas vacías, conflictos y reintentos tras editar el destino. Se usa memoria para cargar el PDF, limitado a 25 MiB.

El recorrido pasó también en la distribución independiente macOS ARM64 y su diagnóstico. No se ha probado en Cloudflare real ni en Windows o Linux. La recuperación usa el importador de escritorio y crea nuevas identidades para los hechos; una importación repetida no sobrescribe cambios posteriores.

Los soportes RUP de proyectos restaurados con esta versión se vuelven a vincular al certificado recuperado de la misma cuenta si coincide su identidad de origen y sigue vigente. Si el RUP se restaura después, repetir la recuperación del proyecto resuelve los soportes sin cambios manuales. Al reintentar una captura restaurada antes de esta mejora, se reconstruye el mapa solo para soportes sin editar que todavía coinciden con los datos originales; los demás deben vincularse manualmente.
