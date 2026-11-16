# Ejecutar revisiones de duplicados en el runner

**Objetivo:** ejecutar desde la web la revisión de duplicados existente con los documentos del proyecto y el runner local, conservando resultados recuperables en la nube.

**Diseño:** el runner descarga únicamente documentos autorizados por la concesión, crea un espacio temporal por trabajo y reutiliza el servicio de escritorio para metadatos, estructura, texto e imágenes. Los tiempos del archivo temporal se excluyen del informe porque no representan los originales. Los resultados se preservarán en almacenamiento de nube sin truncamiento, enlazados al trabajo y protegidos por su concesión; se mostrará explícitamente cualquier análisis parcial. La interfaz debe permitir elegir los documentos de licitación y oferta, consultar el progreso y recuperar los resultados tras recargar. No se utiliza inferencia ni runner alojado.

1. Probar el motor real con documentos de muestra, coincidencias, archivos inválidos, cancelación, aislamiento y limpieza temporal.
2. Implementar adaptador del runner con estado aislado y la limpieza de metadatos y rutas temporales; verificar con la distribución empaquetada.
3. Conectar trabajos autorizados, transferencia durable de resultados completos y vista web; verificar concesiones, revocación, reintentos y aislamiento en Miniflare.
4. Verificar flujos, compilaciones y cancelar sin activar el runner alojado.

**Detalle y gestión:** mostrar recuentos, similitudes y ubicaciones de imágenes con paginación; permitir copiar los fragmentos para localizar hallazgos. La eliminación debe ocultar inmediatamente un informe marcado y ofrecer reintento si falla R2, conservando el historial de tarea. Probar el aislamiento y la eliminación idempotente en Miniflare.

**Estado:** el runner procesa trabajos autorizados y la web permite elegir pliegos y ofertas, cancelar, consultar resultados paginados, copiar fragmentos, revisar ubicaciones y recuentos, exportar y eliminar el informe. La eliminación fallida puede reintentarse. El informe se guarda en R2 como JSON de hasta 25 MiB, incluye las vistas previas disponibles y no se trunca; si supera el límite se informa el error. Pasaron pruebas con documentos reales, imágenes, errores, aislamiento, reintentos y cancelación, también con el runner empaquetado. La revisión visual sigue pendiente. El servicio de escritorio no recibe señal de cancelación durante cada operación de análisis; el adaptador comprueba la señal en las descargas y en cada actualización del servicio.
