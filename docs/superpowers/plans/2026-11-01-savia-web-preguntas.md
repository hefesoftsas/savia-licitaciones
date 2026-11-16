# Preguntas del agente en la web

1. Guardar preguntas y respuestas en D1, vinculadas a la concesión activa y con reintentos idempotentes; verificar aislamiento, cancelación y concurrencia en Miniflare.
2. Conectar el runner a ese canal, renovar la concesión mientras espera y cancelar la espera si se pierde; probar reintentos y redacción de secretos.
3. Mostrar preguntas pendientes en el proyecto, permitir respuestas explícitas y recuperar el estado después de recargar.
4. Integrar la herramienta de Pi en las tareas que necesitan interacción y comprobar el flujo completo antes de continuar la generación del índice.
