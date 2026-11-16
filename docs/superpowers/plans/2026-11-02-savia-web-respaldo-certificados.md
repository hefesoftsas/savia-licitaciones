# Captura parcial de certificados de cuenta

Capturar certificados y sus imágenes mediante el runner propietario, con lecturas versionadas y comprobación de cambios en D1 y R2. Rechazar eliminaciones pendientes y originales ausentes. Validar todos los objetos antes de restaurar, preservar orden y campos, y reutilizar recibos para evitar duplicados, sobrescritura de ediciones o recreación de elementos eliminados. Los soportes de proyectos recuperados deben volver a vincularse cuando corresponda al mismo certificado restaurado en la cuenta, sin sobrescribir cambios posteriores.

Probar cuentas, modificaciones concurrentes, errores, restauraciones en ambos órdenes y runner empaquetado con Miniflare. La captura es parcial, sin credenciales, sin cifrado y no garantiza una instantánea conjunta D1/R2. No desplegar ni activar runner alojado.

**Estado:** captura y restauración implementadas con Miniflare, aislamiento, integridad, conservación de cambios y recibos; los soportes se resuelven en ambos órdenes y mantienen las ediciones. Si existen varias copias posibles no se elige ninguna. El runner empaquetado para macOS ARM64 pasó el recorrido de captura y recuperación. No se ha probado Cloudflare real ni otras plataformas.
