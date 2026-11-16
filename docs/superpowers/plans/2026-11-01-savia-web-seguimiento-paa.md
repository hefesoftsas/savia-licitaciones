# Seguimiento de planes PAA en web

**Objetivo:** seguir planes, detectar cambios de versión, modificación o estado y revisar avisos de forma aislada por cuenta.

**Diseño:** D1 conserva cabeceras, comprobaciones y avisos; el identificador y la revisión de cada seguimiento evitan que respuestas tardías cambien un plan retirado o vuelvan a crear avisos. Un contador por cuenta y plan impide que una solicitud inicial en vuelo restablezca un seguimiento retirado. Las comprobaciones se realizan manualmente o cada seis horas mientras la web esté abierta, con reintento tras 15 minutos si fallan y hasta tres planes por ciclo; no se configura Cron ni runner alojado. Las fuentes vacías no borran campos conocidos. La migración de seguimiento histórico desde escritorio y notificaciones del sistema quedan pendientes.

1. Probar con Miniflare seguimiento, actualización sin cambio, alertas, errores, revisión, aislamiento y solicitudes concurrentes o tardías.
2. Implementar API con transacciones y control de versiones; validar verificaciones periódicas limitadas.
3. Integrar interfaz es/en, seguimiento desde resultados y comprobación mientras la sesión web esté abierta; ejecutar pruebas y builds. No desplegar.

**Estado:** seguimiento, revisiones manuales y periódicas con la web abierta, y avisos revisables implementados y probados con datos públicos simulados. Se verificó el descarte de respuestas tardías, incluidos seguimientos iniciados simultáneamente. Los seguimientos históricos pueden importarse con el runner; faltan notificaciones del sistema y revisión visual.
