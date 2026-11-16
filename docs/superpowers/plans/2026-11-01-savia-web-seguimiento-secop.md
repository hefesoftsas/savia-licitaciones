# Seguimiento SECOP en web

**Objetivo:** detectar cambios de procesos guardados y nuevos documentos sin perder la última referencia fiable ni crear avisos falsos.

**Diseño:** cada proyecto SECOP tiene una línea base y avisos privados en D1. Una revisión obtiene datos frescos y pagina documentos; solo compara el inventario documental cuando todas las páginas están completas. Los valores ausentes conservan los anteriores. Una transacción con revisión y huella del proyecto descarta respuestas tardías y crea avisos una sola vez. La agenda usa el último cierre observado y su nivel de verificación. La web inicia revisiones vencidas con intervalos del escritorio mientras está abierta, sin Cron ni runners alojados. Migración de seguimientos históricos y notificaciones del sistema quedan pendientes.

1. Probar fuente simulada, cambios, errores, documentos parciales, concurrencia, propiedad y fecha observada en Miniflare.
2. Implementar API y agenda, con comprobaciones periódicas limitadas.
3. Integrar avisos y revisión manual, verificar compilaciones y pruebas sin despliegue.

**Estado:** seguimiento por proyecto, avisos y comprobación periódica con la web abierta implementados. La agenda muestra la última fecha observada y los problemas de consulta. Pruebas con Miniflare verifican aislamiento, concurrencia, respuesta tardía y resultados documentales parciales. Los seguimientos vinculados a planes pueden importarse; las copias sin plan asociado pueden importarse por separado; pendientes las notificaciones del sistema y la revisión visual.
