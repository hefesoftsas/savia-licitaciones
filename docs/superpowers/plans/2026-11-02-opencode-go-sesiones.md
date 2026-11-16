# Sesiones aisladas de OpenCode Go

El proxy Pi debe enviar un identificador estable durante todas las llamadas del mismo intento de tarea y distinto entre tareas, incluso cuando no se indique un ámbito de cola. El identificador se deriva del token interno de tarea mediante el hash y sal existentes, sin transmitir el token, identificadores de cuenta, credenciales ni contenido. Mantener separado el ámbito de concurrencia y conservar el comportamiento de solicitudes que no pasan por Pi.

Probar dos tareas reales de Pi con herramientas usando respuestas simuladas: misma sesión dentro de cada tarea, distinta entre tareas, sin clave ni token en el encabezado. Verificar transporte, suites existentes y distribución; sin inferencia ni despliegue real.
