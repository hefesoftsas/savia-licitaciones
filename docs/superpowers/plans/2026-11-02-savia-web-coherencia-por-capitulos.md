# Revisión de coherencia por capítulos en la web

Hacer accesible la revisión por capítulos ya implementada en el runner y la API. La opción sigue desactivada por defecto y requiere activar la revisión de coherencia y autorizar expresamente las llamadas adicionales. El consentimiento queda vinculado a la selección actual; cambiar proyecto, versión, credencial, fuentes o modo lo invalida. La opción se desactiva al desactivar la revisión.

1. Probar los estados y textos es/en, las dependencias de consentimiento y el contrato que se envía a la cola.
2. Integrar el selector en el formulario, explicar una revisión por capítulo y otra comparación, cada una con posibles solicitudes múltiples, y mostrar el método en las tareas existentes.
3. Verificar la creación y recuperación bajo Miniflare, runner simulado y compilaciones. No enviar datos a un proveedor real ni activar un runner alojado.

**Avance:** la opción y su consentimiento se incluyen en el formulario, la tarea indica el método y la selección se conserva en el contrato durable. Pasaron pruebas de interfaz renderizada, Miniflare, reanudación y runner con Pi simulado. Las compilaciones pasan; no se ha realizado revisión visual interactiva porque el navegador local está deshabilitado, ni inferencia real para este modo.
