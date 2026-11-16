# Borrador de revisión de rechazo

**Objetivo:** conservar causales, instrucciones y selección de comprobaciones por proyecto para continuar desde otra sesión.

**Diseño:** D1 almacena un borrador versionado asociado al proyecto; GET devuelve valores iniciales y PUT exige la versión observada. La UI guarda explícitamente, mantiene las ediciones ante conflictos y no guarda consentimiento. La selección de documentos sigue siendo explícita para cada ejecución. Aplicar la misma política de origen y aislamiento que las demás rutas.

1. Probar en Miniflare identidad, validación, persistencia, concurrencia y origen antes de implementar la ruta.
2. Añadir migración y servicio; comprobar las pruebas de API.
3. Cargar y guardar el borrador en la interfaz, conservar cambios en caso de error o de escritura concurrente y no descartar cambios editados durante una solicitud.
4. Verificar pruebas pertinentes y compilación de escritorio y web; anotar cualquier limitación de revisión visual.

**Verificación:** Miniflare comprobó dos cuentas, origen, datos inválidos y dos escrituras concurrentes; las pruebas de revisión y exportación pasaron. Las compilaciones de escritorio y web finalizaron correctamente. La interfaz se comprobó mediante renderizado de servidor, pero aún requiere una prueba interactiva y visual en navegador.
