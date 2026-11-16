# Aislamiento de empresas en escritorio

## Hallazgos y alcance

La biblioteca de credenciales y el certificado RUP actuales pertenecen a un único perfil global. Los análisis, recomendaciones y tareas en segundo plano consumen esos datos; cambiar únicamente el perfil visible permitiría mezclar información entre empresas. Una primera versión seguirá siendo local y no introduce sincronización ni colaboración entre computadores.

## Implementación por etapas

**Enfoque adicional:** un espacio local completo por empresa, seleccionado una vez por proceso de escritorio y cambiado al cerrar y volver a abrir la aplicación. El perfil predeterminado conserva exactamente las rutas actuales, evitando copiar o desplazar datos existentes. Cada espacio adicional tendrá SQLite, originales, instantáneas, carpetas de tareas Pi, cachés y registros propios; la configuración de la aplicación y el licenciamiento permanecen globales. El selector no cierra la aplicación ni interrumpe tareas: la persona decide cuándo terminar su trabajo y reiniciar.

**Avance:** el selector lateral crea espacios, permite renombrar la etiqueta del espacio actual y programa la siguiente apertura; no reinicia Savia ni cambia la empresa de una tarea activa. Renombrar no modifica la razón social del perfil. Se probaron tres aperturas reales, una tarea de análisis en curso, datos distintos de credenciales y licitaciones, separación de SQLite, RUP y raíces de Pi, renombrado persistente y detección de un directorio o base ya inicializada ausentes. Falta completar respaldos, restauración y eliminación selectiva. La selección y el índice de nombres son preferencias locales de la aplicación; los datos de negocio siguen en el espacio correspondiente.

La prueba de tres aperturas incluye ahora dos empresas con el mismo identificador de licitación, pero requisitos y datos RUP diferentes. Las exportaciones CSV y XLSX de cada una contienen solo sus propios datos; al regresar a la primera empresa también se conserva su comparación. La prueba es local y no implica sincronización entre equipos.

1. Crear una empresa predeterminada estable y migrar transaccionalmente el perfil, credenciales, RUP, hechos revisados y archivos actuales. Comprobar restauración y compatibilidad de bases existentes antes de modificar la interfaz.
2. Asociar cada licitación y sus análisis, matrices, formularios, borradores económicos y tareas a una empresa explícita; conservar esa asociación al cambiar de pantalla o reiniciar. Definir cómo se asignan registros anteriores y evitar borrados globales al gestionar una empresa.
3. Pasar el identificador capturado al iniciar cada tarea a los servicios de credenciales, RUP y recomendaciones. Aislar cachés, notificaciones y resultados por empresa, incluso si el usuario cambia de empresa mientras una tarea sigue ejecutándose.
4. Incorporar gestión y selección de empresas con contexto visible en cada licitación, manteniendo una empresa predeterminada para instalaciones existentes. No transferir automáticamente información entre empresas.
5. Probar la migración de datos reales de ejemplo, dos empresas con información contradictoria, tareas simultáneas, reinicio, importación y exportación, eliminación selectiva y fallo durante migración. Verificar que no haya filtraciones cruzadas de nombres, RUP, credenciales ni recomendaciones.

## Colaboración

La colaboración simultánea entre máquinas necesita una fuente de verdad compartida, identidad, permisos, resolución de conflictos y una decisión explícita sobre infraestructura y costos. No debe presentarse como disponible mediante la licencia ni como una capacidad local existente; evaluar y diseñar ese servicio por separado después del aislamiento local.
