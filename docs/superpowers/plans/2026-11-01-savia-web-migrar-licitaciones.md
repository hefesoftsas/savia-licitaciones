# Migración de licitaciones guardadas sin plan

**Objetivo:** conservar las copias de licitaciones y sus datos históricos cuando no pertenecen a un plan de escritorio disponible.

**Diseño:** el runner relaciona cada copia con los identificadores reales de los planes e instantáneas y excluye las vinculadas o ambiguas; informa esos casos para importar el plan correspondiente. Para las restantes, una operación crea atómicamente un proyecto, la ficha SECOP cuando corresponda, la línea base y avisos, y una copia histórica del resumen, análisis, texto extraído y referencias oficiales. Los registros locales se conservan como proyectos sin consultas SECOP. Un recibo por respaldo y origen evita duplicados; una licitación ya guardada en web produce conflicto sin crear un proyecto vacío. Tareas, requisitos y oferta se importan con los protocolos existentes, y los documentos extraídos se consultan como históricos, no como originales ni fuentes verificadas.

1. Probar respaldo real con licitaciones SECOP y locales, proyectos vinculados, conflictos, aislamiento, seguimiento y reintentos.
2. Implementar lector, API transaccional y CLI; preservar los datos de seguimiento disponibles sin consultar fuentes públicas.
3. Mostrar la copia histórica en la web y verificar runner empaquetado, compilaciones y fallos. No desplegar.

**Estado:** copias independientes SECOP y locales, seguimiento y datos históricos implementados; se señalan conflictos, datos incompatibles y vínculos ambiguos. La revisión visual sigue pendiente. Los archivos originales no se reconstruyen a partir de texto extraído.
