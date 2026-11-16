# Entrega de copias corregidas grandes

Las correcciones anónimas reciben el original por flujo, pero `uploadJobArtifact` limita la copia a 25 MiB y el runner la lee completa en memoria. Para cerrar ese flujo, permitir copias DOCX mayores por multipart R2 hasta 1 GiB, bajo la concesión vigente y con SHA-256 comprobado. La publicación de `job_artifacts` sigue siendo idempotente por tarea; un reintento de contenido distinto produce conflicto y las partes y staging se limpian al fallar o vencer. Se mantiene la ruta existente para los informes y archivos pequeños.

1. Probar autenticación, aislamiento, vencimiento, firma, integridad, reintentos y limpieza con Miniflare.
2. Añadir la entrega por archivo y partes al runner y conectar la corrección antes de eliminar su espacio temporal; comprobar recuperación de confirmaciones perdidas y cancelación.
3. Verificar con runner empaquetado, helper OpenXML y pruebas existentes. Declarar que el procesamiento de imágenes y los límites reales de Cloudflare requieren medición; no desplegar.

**Avance:** las copias corregidas mayores de 25 MiB se envían por partes desde el archivo temporal; el servidor comprueba SHA-256 y la concesión antes de publicarlas. Miniflare verificó un objeto de 25 MiB más un byte, hash incorrecto, aislamiento, vencimiento y recuperación de una respuesta perdida; también pasó con el runner empaquetado. El helper real y la entrega desde el archivo temporal pasaron pruebas con DOCX pequeños. No se ha probado 1 GiB ni Cloudflare real. La captura parcial de proyectos ya puede recuperar copias anónimas grandes mediante staging multipart verificado. Las copias grandes se conservan cifradas localmente hasta confirmar el resultado y pueden exportarse manualmente si la entrega se interrumpe.
