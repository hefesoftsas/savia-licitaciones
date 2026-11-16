# Vincular proyectos a la biblioteca recuperada

Al recuperar un proyecto se puede proporcionar opcionalmente una captura de la biblioteca de la misma cuenta de origen. Antes de escribir, validar ambas capturas y comprobar que cada documento referenciado tiene la misma identidad, contenido e índice; si no coincide, rechazar la operación. Recuperar o reutilizar la biblioteca con sus recibos y utilizar el mapa de entradas en los capítulos. Repetir con la misma captura no debe duplicar documentos ni sobrescribir índices editados. Sin la opción se conserva el comportamiento anterior. La recuperación sigue siendo parcial y no constituye una copia atómica de la cuenta.

- [x] Prueba Miniflare con biblioteca y proyecto de origen, reintentos y diferencias rechazadas antes de escribir.
- [x] Integrar validación, mapa de identidades y opción CLI; verificar ambos recorridos y documentación.

Miniflare cubre identidad de documentos e índices, reintentos, contenido diferente e índice editado en destino. Las capturas continúan siendo parciales y no atómicas; el control de la interfaz y proveedores reales quedan fuera de esta comprobación.
