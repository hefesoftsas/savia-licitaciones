# Agenda web

**Objetivo:** reunir las tareas pendientes con fecha y los cierres SECOP guardados en todos los proyectos del usuario.

**Diseño:** usar la función `buildAgenda` del escritorio para mantener la validación de fechas, el orden y la distinción entre cierres SECOP II verificados y fechas por revisar. Consultar proyectos y tareas con filtro de propietario; los proyectos sin SECOP también pueden tener tareas. La interfaz abre el proyecto correspondiente y no atribuye verificación a fechas que no la tienen. Los certificados generales, el seguimiento de cambios SECOP y los avisos automáticos aún no tienen fuentes web equivalentes y se informan como pendientes.

1. Probar en Miniflare fechas válidas e inválidas, tareas completadas y proyectos sin SECOP, aislamiento entre cuentas y fuentes de cierres.
2. Implementar la consulta autenticada con la lógica compartida y probarla.
3. Añadir navegación e interfaz es/en, verificar build y pruebas; no desplegar.

**Estado:** tareas y cierres guardados disponibles desde Agenda; se comparten las reglas de fecha del escritorio y se verificó el aislamiento en Miniflare. Los vencimientos de certificados web ya aparecen en la agenda. El seguimiento de cambios SECOP alimenta la agenda mientras la web está abierta; faltan los recordatorios automáticos y la migración del seguimiento histórico. La revisión visual en navegador sigue pendiente.
