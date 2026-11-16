# Recuperación de la biblioteca de conocimiento

**Objetivo:** capturar y recuperar la biblioteca de conocimiento completa de una cuenta, no solo las fuentes vinculadas a un proyecto.

**Diseño:** la lectura autenticada selecciona carpetas, documentos, entradas de índices y elementos históricos por propietario. Identifica originales disponibles, ausentes y en eliminación; las lecturas condicionales R2 y una revisión final detectan cambios observados. El runner crea una captura parcial con manifiesto verificable y sin claves de R2. La recuperación debe validar relaciones y contenido antes de escribir, preservar orden e índices e historial, no sobrescribir cambios ni recrear registros eliminados y reanudar transferencias interrumpidas mediante recibos. Las tareas activas y credenciales se excluyen; D1 y R2 no forman una instantánea conjunta.

- [x] Prueba Miniflare de captura con carpetas vacías, originales, ausentes, índices y elementos históricos; verificar aislamiento, cambios y ausencia de objetos.
- [x] Implementar transporte y captura en el runner y comprobar el paquete.
- [x] Implementar recuperación completa con orden, remapeo, históricos, faltantes y reintentos sin sobrescritura; probar antes de anunciar restauración.

La recuperación valida la captura antes de escribir, conserva el nombre de fuente adjunta, importa por orden relativo y rechaza índices editados. El índice requiere de 1 a 500 entradas y una fuente disponible: se rechazan antes de escribir capturas incompatibles. Los proyectos restaurados por separado pueden crear copias independientes. Los archivos locales son legibles y esto no es una copia completa de cuenta.
