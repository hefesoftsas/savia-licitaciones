# Restauración coordinada de proyectos

Recuperar los proyectos de un conjunto creado por `capture-account-projects` mediante el restaurador parcial existente. Antes de escribir, comprobar el índice, el orden y unicidad de IDs, las carpetas derivadas del hash, la integridad de cada captura y que sus metadatos pertenezcan al proyecto indicado. La validación específica de contenido y conflictos continúa en el restaurador individual. El proceso es secuencial y no atómico: al fallar, informar el proyecto y conservar los resultados anteriores para reintentar con los mismos recibos. Una captura sin índice debe recuperarse proyecto por proyecto.

Permitir opcionalmente la captura de biblioteca compartida que exige el restaurador individual, para conservar sus vínculos. Si falta o no coincide una referencia, detenerse con el error existente. Informar origen, proyecto de destino, resultados y datos omitidos; no incluir credenciales ni presentar una recuperación completa de cuenta. No recrear proyectos o archivos retirados por el usuario.

1. Probar antes de escribir corrupción, índices y rutas inválidas, cambios entre capturas y errores recuperables; validar también el directorio de conocimiento opcional.
2. Conectar el CLI y la distribución, documentar orden, conflictos y límites.
3. Verificar el recorrido entre dos cuentas con Miniflare, archivos de R2, reintentos y runner empaquetado.

**Estado:** `restore-account-projects` valida índice e integridad de todos los proyectos y llama al restaurador individual con la biblioteca opcional. Las pruebas en Miniflare con el runner empaquetado en macOS recuperaron dos proyectos y un archivo R2 entre cuentas, simularon una interrupción y comprobaron que el reintento conserva una edición posterior. Se valida la correspondencia de identificadores aunque el hash del archivo sea válido. La validación específica y los conflictos siguen tratándose por proyecto; un error posterior puede dejar cambios parciales. No incluye todos los datos de cuenta ni se ha comprobado el paquete en Windows o Linux.
