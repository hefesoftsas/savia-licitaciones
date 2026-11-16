# Eliminación de proyectos web

La paridad con escritorio requiere permitir al propietario eliminar un proyecto y sus documentos y resultados, sin tocar bibliotecas de cuenta u otros proyectos. Se rechaza si hay tareas en cola o ejecutándose. La API debe registrar en una transacción los objetos asociados, borrar el proyecto y sus registros relacionados, y limpiar R2 por lotes con recibos persistentes; si R2 falla, el mismo propietario puede reintentar. Las cargas interrumpidas conservan su staging de limpieza existente. La interfaz debe exigir confirmación, advertir que es irreversible y permitir reintentar la limpieza. No se eliminan datos reales durante el desarrollo o pruebas.

- [x] Prueba Miniflare: aislamiento, tareas activas, resultados y archivos asociados, fallos R2 y reintentos, sin borrar objetos compartidos.
- [x] Implementar migración, API y protección de referencias; probar concurrencia y cascadas.
- [x] Integrar control confirmado en web y verificar build y pruebas.

Las pruebas en Miniflare verifican aislamiento, tareas activas, cascadas, fallos de R2, reintentos y protección de referencias compartidas. El sitio compilado comprueba la autenticación y origen de la ruta; la interfaz se verificó por renderizado estático, sin navegador automatizado ni Cloudflare real. Las limpiezas se procesan en lotes de 20 y las pendientes siguen visibles tras recargar.

La transacción también borra el contenido histórico y los nombres de archivo retenidos en recibos del proyecto; conserva las huellas necesarias para no recrearlo. El título se elimina del recibo cuando termina la limpieza. La prueba de importación comprueba que un reintento posterior siga respondiendo como retirado.
