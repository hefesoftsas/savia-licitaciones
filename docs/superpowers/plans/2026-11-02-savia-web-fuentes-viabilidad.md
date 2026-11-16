# Fuentes nuevas del informe de viabilidad

El escritorio admite varios documentos locales y sustituye el lote anterior al confirmar la importación, invalidando análisis, índice, parámetros y contenido dependientes. La web debe mantener los originales por cuenta y procesarlos en el runner local; no debe mostrar una importación parcial como lote completo.

1. Crear cargas privadas idempotentes en R2 para los documentos originales; vincularlas a la cuenta y limitar tamaño. Confirmar el lote con versión optimista en una operación D1 que actualice fuentes y limpie etapas dependientes. Los reintentos y cargas huérfanas deben ser recuperables, sin reemplazar cambios posteriores.
2. Conectar selección múltiple y confirmación de reemplazo a la interfaz, con información de progreso, errores y versiones. Permitir descargar las fuentes originales y distinguir textos históricos.
3. Encolar y ejecutar la extracción de Word, PDF, Excel y texto en el runner local con las mismas herramientas disponibles en escritorio. Guardar los textos y referencias de imágenes por fuente, indicar formatos no compatibles y no enviar contenido al proveedor durante la extracción.
4. Conectar los textos extraídos a las tareas Pi de análisis; validar cancelación, pérdida de conexión, límites, dos cuentas, archivos incompletos y recuperaciones con Miniflare y runner empaquetado.

La extracción local está conectada para los formatos admitidos por el parser de escritorio, con publicación del lote solo al finalizar y descarga autenticada. DOC/WPS pueden requerir LibreOffice en el equipo del usuario. Las imágenes incrustadas y su conservación siguen pendientes, así como usar los textos para las tareas Pi.
