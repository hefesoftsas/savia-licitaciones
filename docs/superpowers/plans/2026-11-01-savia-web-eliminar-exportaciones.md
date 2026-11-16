# Eliminación de archivos de exportación

- Conservar la fila de cada archivo como marca de eliminación (`deleted_at`) y registrar la limpieza física (`storage_deleted_at`): así un fallo de R2 puede reintentarse sin volver a exponer la descarga ni perder la clave del objeto.
- `DELETE /api/projects/:projectId/jobs/:jobId/artifact` solo acepta al propietario, el mismo origen y trabajos terminados. Repetir la operación es seguro; un error de R2 devuelve 503 y mantiene la marca pendiente.
- La lista de trabajos informa si el archivo está guardado, pendiente de limpieza o eliminado. La interfaz confirma la eliminación y ofrece reintentar la limpieza pendiente. No borra el plan ni el historial de la tarea.
- Probar aislamiento, idempotencia, reintento tras fallo de R2, descarga denegada y límites de estado con Miniflare y una prueba de fallo controlado del servicio. No configurar cron ni desplegar.
