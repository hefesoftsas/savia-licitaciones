# Migrar evaluaciones históricas de ofertas

**Objetivo:** trasladar al proyecto web las evaluaciones del escritorio, sus fuentes y revisiones humanas, sin reemplazar evaluaciones existentes.

**Diseño:** el runner lee SQLite del respaldo por identificador real de proyecto; conserva fuentes, criterios, decisiones y estados terminales, y marca tareas en curso como interrumpidas. Los originales de oferta disponibles se importan como documentos de proyecto; se informan los ausentes. Cada evaluación se importa con identidad y huella idempotentes, con informe privado en R2 y revisiones iniciales en D1. La eliminación no reimporta contenido retirado por el usuario.

1. Probar extracción aislada por proyecto, respaldo antiguo, estados y originales disponibles o ausentes.
2. Implementar importación idempotente, aislamiento y eliminación con Miniflare.
3. Conectar el comando de importación y la interfaz existente sin exponer contenido en los logs.
4. Verificar con runner empaquetado, pruebas y compilaciones; reportar cualquier documento que no esté en el respaldo.
