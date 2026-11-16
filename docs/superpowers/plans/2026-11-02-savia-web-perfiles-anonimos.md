# Perfiles de revisión anónima

**Objetivo:** editar y conservar por proyecto las reglas del motor de escritorio y asociar una copia inmutable a cada inspección.

**Diseño:** D1 guarda un perfil normalizado por proyecto con control de versión. Se reutiliza el editor y la normalización existentes; la cola copia el perfil guardado en la tarea. El runner conserva compatibilidad con tareas antiguas basadas en el perfil general. El usuario guarda explícitamente antes de ejecutar. No se activa la revisión con IA ni se usa el registro de empresa sin implementar su conexión.

1. Probar aislamiento, versión, origen, normalización e instantánea de la tarea en Miniflare.
2. Añadir almacenamiento, ruta y captura de perfil; ejecutar la inspección con el perfil capturado.
3. Conectar el editor existente, proteger cambios sin guardar y mostrar versión e instrucciones.
4. Verificar tareas existentes y nuevas, paquetes, compilaciones y limitaciones visuales.

**Verificación:** Miniflare cubrió aislamiento, conflictos de versión y persistencia de la instantánea. Una revisión con DOCX real comprobó que el perfil personalizado y sus términos sensibles llegan al helper; el mismo recorrido pasó con el CLI empaquetado en macOS ARM. Las compilaciones de escritorio y web pasaron. Falta revisión visual interactiva y validar Windows/macOS x64; la revisión con IA y la reparación continúan pendientes.
