# Plan técnico web: edición manual

- Guardar capítulos y subcapítulos por proyecto en D1; el servidor asigna UUID y calcula la numeración según el orden, sin usar el número como identidad.
- Aplicar las reglas de persistencia en el servidor: ordenar conserva el contenido; las mutaciones de estructura y edición invalidan solo los nodos afectados; eliminar una rama no altera las demás.
- Usar versiones y una operación atómica por mutación para impedir sobrescrituras concurrentes entre sesiones.
- Añadir una interfaz manual en español e inglés que avise antes de operaciones que pueden invalidar contenido.
- Probar aislamiento, UUID, árbol, invalidación, orden, concurrencia y compilación. La generación Pi, planes de contenido, importación de proyectos de escritorio y exportación permanecen pendientes.
