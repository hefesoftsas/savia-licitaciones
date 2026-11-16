# Entrega de resultados del runner

- Mantener la renovación de concesión durante el envío de resultados y reintentar fallos transitorios de red, 429 y 5xx con un límite de tiempo.
- Tratar la finalización como idempotente: si el servidor guardó el resultado pero la respuesta se perdió, repetir el mismo cuerpo y aceptar su confirmación.
- Interrumpir el agente ante revocación, cancelación o imposibilidad prolongada de renovar; nunca reclamar otra tarea mientras se está entregando la actual.
- Probar con un servidor local respuestas perdidas, errores transitorios, renovación y cancelación. Los resultados finales pendientes se conservan cifrados en la bandeja local y se reintentan al reiniciar; los rechazados se conservan para revisión.
- La planificación y los borradores técnicos se guardan progresivamente en la nube. Ante errores transitorios o respuestas perdidas, el runner reenvía el mismo contenido dentro del límite de entrega y con la concesión vigente; detiene el reintento ante un rechazo definitivo o una concesión perdida.
