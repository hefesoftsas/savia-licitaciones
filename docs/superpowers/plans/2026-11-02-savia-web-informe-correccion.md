# Informe detallado de la copia corregida

**Objetivo:** conservar y mostrar los hallazgos completos de la reinspección de la copia corregida.

**Diseño:** la tarea guarda dos objetos privados: DOCX e informe JSON; ambos se asocian a la concesión y a la misma tarea, con carga idempotente y limpieza conjunta. Se exige el informe para nuevas tareas marcadas con la versión del protocolo; las tareas históricas siguen disponibles. La interfaz muestra los grupos y sus ejemplos sin afirmar que la corrección garantiza el cumplimiento.

1. Probar aislamiento, persistencia, reintentos y eliminación de ambos objetos; comprobar que tareas antiguas siguen funcionando.
2. Añadir migración, carga del informe bajo concesión y descarga privada; evitar que la limpieza borre objetos referenciados.
3. Enviar el informe completo desde el runner y consultarlo en la interfaz.
4. Ejecutar pruebas de Miniflare y runner empaquetado, y compilar.

**Verificación:** Miniflare comprobó aislamiento, cargas simultáneas idempotentes, cancelación, compatibilidad con tareas antiguas y eliminación conjunta; pruebas específicas cubrieron fallos y reintentos de R2. El recorrido completo pasó con el módulo y el CLI empaquetados en macOS ARM, y compilaron escritorio y web. La reinspección es programática y no incorpora una nueva revisión de Pi; queda pendiente una comprobación visual interactiva y la validación en otras plataformas.
