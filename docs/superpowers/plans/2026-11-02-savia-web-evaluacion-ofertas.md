# Evaluación de ofertas en Savia web

**Objetivo:** trasladar la evaluación de una oferta frente a los criterios del pliego, con citas verificadas y revisión humana persistente.

**Diseño:** una tarea del runner descarga los documentos seleccionados bajo concesión y usa el servicio y validador del escritorio con Pi/OpenCode Go. El informe privado conserva las fuentes extraídas y los criterios, sin calcular un total. Las revisiones humanas por criterio se guardan por tarea con control de versiones; la interfaz muestra límites, citas y exportación. El consentimiento para enviar documentos es explícito y no hay runner alojado.

1. Probar el adaptador con Pi simulado, fuentes legibles e ilegibles, evidencia no verificada, cancelación y limpieza.
2. Conectar cola y artefacto con aislamiento, versiones y reintentos; agregar revisión humana y exportación.
3. Construir la interfaz reutilizando convenciones del escritorio, con advertencia de revisión humana.
4. Verificar Miniflare, runner empaquetado y compilaciones; anotar pruebas pendientes con proveedor real y navegador.

**Verificación:** el validador del escritorio y el adaptador se probaron con citas válidas, citas inventadas y documentos ilegibles. Miniflare cubrió consentimiento, aislamiento, revisión concurrente, exportación, cancelación y eliminación; el mismo flujo pasó con el módulo empaquetado en macOS ARM y Pi simulado. Compilaron escritorio y web. Pendientes: prueba con proveedor real, revisión visual interactiva, importación de evaluaciones históricas y validación en otras plataformas.
