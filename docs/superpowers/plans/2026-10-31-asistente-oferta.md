# Asistente de oferta: plan de implementación

**Objetivo:** guiar desde la búsqueda de una licitación hasta la exportación del Word, reutilizando el proyecto y el flujo técnico existentes.

**Arquitectura:** nueva entrada de navegación que contiene la búsqueda SECOP y el editor técnico existentes; la importación inicia el editor sin perder el proyecto activo. El avance técnico y los documentos siguen siendo los guardados por Main/SQLite. El asistente solo mantiene en memoria qué vista mostrar y presenta el paso real del editor, sin inventar estados de finalización.

**Restricciones:** preservar la protección de cambios sin guardar, tareas en segundo plano, selección de proyecto, soporte es/en, accesibilidad, tamaño reducido y funcionalidad existente; no introducir proveedores o dependencias.

- [x] Integrar el asistente en navegación y permitir iniciar búsqueda o retomar el proyecto actual.
- [x] Conectar la preparación SECOP con el flujo técnico y mostrar la fase real sin omitir validaciones existentes.
- [x] Mantener el guard de salida al volver a buscar o navegar y no cambiar de proyecto silenciosamente.
- [x] Verificar compilación, navegación, selección SECOP simulada, importación local, avance existente, reanudación, exportación y presentación a distintos tamaños/idiomas.

La comprobación Electron usa un perfil temporal, simula las respuestas y la descarga de SECOP e importa un archivo local real; crea un Word y comprueba su contenido. No depende de un modelo ni consulta SECOP en producción.
