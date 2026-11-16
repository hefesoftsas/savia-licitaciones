# Preguntas del agente en viabilidad

- Permitir que las tareas Pi de análisis, índice, parámetros y contenido consulten al usuario solo cuando una decisión material no pueda quedar pendiente.
- Reutilizar el canal de preguntas del runner con persistencia separada para tareas de cuenta; exigir cuenta, concesión vigente, versión del informe e idempotencia.
- Mostrar y responder preguntas pendientes en el informe sin respuesta preseleccionada; al cancelar o modificar el informe dejar de aceptar respuestas pendientes.
- Probar respuestas, aislamiento, caducidad, cancelación, protección de secretos y compatibilidad con preguntas de proyectos, además del runner empaquetado y Miniflare.
