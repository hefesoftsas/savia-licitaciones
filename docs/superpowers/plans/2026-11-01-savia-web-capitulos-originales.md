# Documentos originales de biblioteca en borradores

**Objetivo:** permitir que Pi consulte el texto completo de los documentos de biblioteca correspondientes a las entradas elegidas para redactar un capítulo.

**Arquitectura:** la interfaz añade una opción independiente y autorización para los documentos completos. El trabajo guarda únicamente la selección de entradas, sus revisiones y la autorización. La API deriva los documentos de la selección, valida concesión y fuentes y entrega solo esos originales al runner. El runner extrae el texto localmente y lo ofrece como archivos de lectura a Pi. Las guardas existentes impiden aplicar resultados con fuentes obsoletas.

**Tecnologías:** Worker, D1, R2, Better Auth, Miniflare, React, Pi y parser local; diseño `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Condiciones
- Opción desactivada por defecto y consentimiento específico vinculado a capítulo, credencial y selección; exige también autorización de entradas.
- Sin acceso por runner a documentos no seleccionados, de otras cuentas, ni a tareas vencidas o canceladas.
- TXT, Markdown, DOCX y PDF con texto; no truncar silenciosamente documentos demasiado largos.
- Rechazar si la entrada o el documento cambia o se elimina; no usar runner alojado ni proveedores adicionales.
- Las tareas anteriores conservan su comportamiento; las citas seleccionadas siguen funcionando sin descargar los originales.

## Verificación
1. Miniflare: consentimiento, selección, aislamiento, acceso por concesión, revocación, versiones y origen.
2. Runner: extracción y limpieza, ausencia de descargas sin autorización, rechazo de formato/tamaño, Pi simulado leyendo el original completo.
3. Interfaz: opción y consentimiento claros, lista de documentos y reinicio de autorización cuando cambian las fuentes.
4. Suites API/runner, compilaciones web/escritorio y chequeo del servicio CommonJS modificado.
