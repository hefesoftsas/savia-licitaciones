# Sugerencias de requisitos con Pi

1. Permitir una tarea de proyecto versionada con documentos seleccionados, credencial OpenCode Go y consentimiento. La inclusión de datos revisados del RUP requiere selección explícita; no enviar información de empresa de forma implícita.
2. Registrar la identidad de las fuentes seleccionadas, el conjunto de documentos y, si se incluye, la versión y los datos revisados del RUP. El runner obtiene las fuentes y el perfil solo con su concesión; rechazar cambios antes o después del análisis.
3. Reutilizar el parser local y `requirementSuggestionService.cjs`, que exige citas literales y descarta enlaces inventados. Los resultados no modifican la matriz automáticamente.
4. Al aceptar una sugerencia, validar propiedad, tarea, cita y vigencia de las fuentes en una operación atómica e idempotente. Conservar procedencia y mostrar requisitos como pendientes; nunca inferir habilitación.
5. Integrar seguimiento, cancelación y revisión en la web. Probar con Pi y proveedor simulados, aislamiento, concurrencia, cambios de fuentes, consentimiento y recuperación. No activar infraestructura alojada.
