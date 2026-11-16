# Referencias de biblioteca para borradores de capítulos

**Objetivo:** permitir añadir entradas de conocimiento aceptadas y seleccionadas al contexto de redacción de un capítulo.

**Arquitectura:** selección y consentimiento específicos con IDs y revisiones; la API captura una instantánea separada de las fuentes de hechos globales. La concesión entrega al runner únicamente las entradas autorizadas. Las validaciones y la aplicación del borrador rechazan cambios en dichas fuentes; los hechos globales mantienen sus propias reglas y precedencia.

**Tecnologías:** D1, Miniflare, Better Auth, React y Pi. Diseño: `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Límites y requisitos
- Selección opcional de hasta 30 entradas, consentimiento específico ligado a capítulo, credencial y selección; sin archivos originales ni otras entradas.
- Rechazar entradas ajenas, inexistentes o modificadas; vigilar las versiones en la cola, el contexto y la aplicación del resultado.
- Preservar documentos, hechos globales, consentimiento RUP y tareas anteriores sin selección.
- Esto añade los extractos aceptados; la lectura del documento de biblioteca completo y la generación avanzada de escritorio siguen pendientes.
- Sin proveedores adicionales, Workers AI ni runner alojado.

## Verificación
1. Miniflare: consentimiento, aislamiento, entrega acotada, vigencia, rechazo al aplicar y comportamiento sin selección.
2. Runner: ausencia de lectura de credenciales sin consentimiento, contexto con citas elegidas y generación con Pi simulado.
3. Interfaz es/en con selector compartido, revisión de citas y autorización vinculada a la selección.
4. Pruebas API/runner y compilación web y escritorio.
