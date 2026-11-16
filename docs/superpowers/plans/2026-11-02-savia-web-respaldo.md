# Respaldo y restauración de Savia web

El objetivo es permitir recuperar los datos de una cuenta, incluidos los objetos de R2, en una cuenta de destino autorizada. Una descarga de un plan o de una lista de objetos no es un respaldo completo. Hay comandos de captura y recuperación parcial para el runner; no existe aún una restauración completa de cuenta.

## Cobertura inicial

El inventario versionado en `web-api/src/backup-coverage.js` describe las 128 tablas actuales, su punto de partida para comprobar propiedad y las 27 columnas `object_key`. No aprueba ninguna tabla de negocio para exportación: 122 están pendientes de análisis y una contiene credenciales de proveedor cifradas que requieren un tratamiento explícito. Las sesiones, cuentas de autenticación, códigos efímeros y emparejamientos no se deben restaurar como sesiones o tokens válidos. Los datos de identidad de usuario requieren decidir qué campos pueden copiarse a una cuenta de destino sin sobrescribirla.

La prueba `node --test web-api/test/backup-coverage.test.mjs` aplica todas las migraciones a una base temporal y falla si aparecen tablas, columnas de objetos o relaciones de propiedad no inventariadas. Comprobar una columna `owner_id` o una clave foránea no basta para garantizar aislamiento: las relaciones cruzadas, referencias en JSON, estados de eliminación, objetos no disponibles y recibos de importación deben revisarse individualmente. La prueba no afirma que exista una copia restaurable ni que detecte todas las referencias semánticas a R2.

## Etapas pendientes

1. Clasificar cada tabla de negocio y sus columnas: incluir, reconstruir, conservar como historial, conservar marcas de eliminación o excluir con justificación; verificar todas las rutas de propiedad y referencias de cuentas.
2. Diseñar una captura consistente de D1 y R2 que detecte cambios durante la descarga, no omita objetos ausentes y genere hashes verificables sin cargar todos los archivos en memoria. Informar de forma explícita cualquier parte incompleta.
3. Definir el tratamiento de credenciales cifradas y claves de cifrado sin exponer secretos ni romper los límites configurados. No asumir que una copia cifrada puede descifrarse en otra instalación.
4. Restaurar primero en un espacio aislado con identificadores y relaciones verificadas, sin sobrescribir datos existentes; convertir tareas activas en estados recuperables y conservar la semántica de eliminaciones.
5. Probar interrupciones, reanudación, integridad de objetos, cuentas cruzadas y restauración completa con Miniflare; medir costos y límites antes de cualquier despliegue. No habilitar un runner alojado.

## Base local de integridad

`runner/cloud-snapshot-archive.mjs` prepara una carpeta nueva de componentes, copia cada objeto por streaming, comprueba su tamaño y calcula SHA-256; si el origen proporciona un SHA-256 también lo contrasta. Escribe el manifiesto solo al terminar. La verificación vuelve a leer metadatos y objetos, rechaza rutas ajenas, archivos alterados y enlaces simbólicos; una interrupción no deja un manifiesto de éxito y conserva cualquier archivo ajeno creado durante la operación. La carpeta se marca siempre como incompleta y declara los componentes omitidos. Los archivos son legibles por la cuenta local, no están cifrados; los hashes detectan alteraciones accidentales pero no autentican la procedencia.

Esta pieza no restaura cuentas ni proyectos completos. Falta resolver la consistencia durante la captura, el cifrado y la restauración completa con las comprobaciones descritas arriba. Las pruebas usan datos sintéticos; en Windows real se verificó el rechazo de una unión NTFS en el directorio de objetos. La comprobación de enlaces simbólicos individuales sigue pendiente en Windows.

## Fuente parcial de proyectos

`web-api/src/project-snapshot-source.js` lee la cabecera, los archivos y el seguimiento de un proyecto de la cuenta indicada mediante una transacción de lectura D1, verifica que no haya eliminaciones en curso y comprueba tamaño y ETag en R2. La lectura condicional rechaza un objeto reemplazado y `assertUnchanged` vuelve a comparar D1 y R2 tras la lectura. La fuente no incluye otras tablas, eliminaciones ya completadas ni credenciales. Las comprobaciones detectan cambios observados, pero no crean una instantánea atómica entre D1 y R2 ni prueban que no haya habido cambios intermedios; no se debe presentar como respaldo consistente.

### Transporte parcial

El runner autenticado obtiene los metadatos permitidos, una revisión calculada a partir de las filas y ETags observados y una versión individual por archivo. Cada descarga comprueba la versión individual y usa lectura condicional; al terminar se contrasta de nuevo la revisión global. El comando `capture-project-components --project ID --output RUTA_ABSOLUTA` descarga cada archivo una vez, calcula su SHA-256 mientras lo escribe y marca los componentes omitidos. Este hash se calcula localmente y no es una suma independiente del origen. Una prueba con Miniflare cubre el CLI, aislamiento, revocación y cambios durante la descarga. La revisión no convierte la lectura en una instantánea atómica; no incluye credenciales y no es un respaldo completo. Los archivos locales no están cifrados. Falta la cobertura de las demás tablas y la restauración completa.

Cada descarga comprueba únicamente el objeto solicitado, sin consultar los demás archivos. La lectura inicial y la revisión final siguen consultando todos los ETags: las operaciones crecen linealmente con el número de archivos. Hay que medir límites de ejecución y costos, y diseñar paginación para proyectos grandes antes de recomendar o desplegar este transporte.

### Recuperación parcial

El comando `restore-project-components --snapshot RUTA_ABSOLUTA` verifica manifiesto y hashes, correspondencia exacta entre metadatos y objetos y límites de importación antes de crear nada. Reutiliza la importación de escritorio para crear un proyecto nuevo y subir sus archivos y seguimiento mediante recibos idempotentes por cuenta; puede reintentarse tras interrupciones sin sobrescribir proyectos existentes ni reponer archivos eliminados posteriormente. El seguimiento incluye estado, tareas y requisitos; estos reciben nuevas identidades en la cuenta de destino. Las capturas anteriores sin seguimiento siguen siendo compatibles. La recuperación informa los componentes omitidos y no es una restauración completa. Admite archivos de proyecto de hasta 1 GiB: los mayores de 25 MiB se envían por flujo y los mayores de 50 MiB en partes de 10 MiB. El servidor comprueba el tamaño y SHA-256 del objeto completo antes de publicarlo. Las partes fallidas se pueden reintentar durante la ejecución; tras una interrupción completa se inicia otra carga. R2 elimina las cargas multipart incompletas según su plazo de retención. Los recursos de plan, imágenes y documentos de conocimiento siguen sujetos a sus límites previos. Las pruebas de Miniflare cubren aislamiento, integridad, reintentos y fallos. El contenido restante y la restauración completa siguen pendientes.

### Nodos del plan técnico

La captura incluye los nodos y su estructura en la revisión D1. La recuperación reutiliza la importación transaccional, conserva UUID de nodos, contenido, orden y atributos y remapea los requisitos y las entradas de conocimiento recuperadas. Antes de crear el proyecto rechaza referencias que no estén capturadas y datos de planificación que el importador no pueda preservar. Los estados se reconstruyen a partir del contenido; no se restauran tareas activas. El importador mantiene la misma huella idempotente para solicitudes antiguas sin atributos.

### Recursos de plan

La captura incluye los recursos de `project_plan_assets` de la cuenta junto con su referencia, tipo, tamaño, ETag y hash de contenido. Comprueba ese hash independiente mientras escribe el objeto local y usa la importación de recursos existente para conservar la referencia usada por los capítulos. Rechaza antes de crear el proyecto los recursos que superen el límite de importación o no cumplan sus requisitos de formato. Mantiene la compatibilidad con capturas anteriores; las pruebas de Miniflare cubren reintentos, alteraciones y aislamiento. La biblioteca de imágenes compartida y demás recursos no incluidos siguen siendo componentes omitidos.

Para imágenes de la biblioteca referenciadas desde capítulos, el runner captura las referencias de imágenes efectivamente usadas por el plan y verifica propiedad, disponibilidad y ETag. Las recupera como recursos del proyecto de tipo URL con la referencia original: la vista y la exportación priorizan esos recursos, por lo que no hace falta modificar el texto. Si existe un recurso de proyecto con esa misma referencia se conserva su precedencia. Los originales ausentes detienen la captura. Una prueba comprueba que la vista resuelve el recurso recuperado y que no se confunden referencias dentro de bloques de código con imágenes. La biblioteca completa sigue fuera de alcance de esta captura parcial.

El servidor primero detecta candidatos por la ruta textual y el runner después identifica las imágenes reales mediante el analizador Markdown. Un candidato usado solo como texto puede no tener objeto sin bloquear la captura; si cambia durante ella, la verificación conservadora puede exigir un reintento aunque no sea una imagen usada.

### Referencias de conocimiento

Las entradas de `knowledge_entries` apuntan a un documento y un índice (`knowledge_indices`) propios de la cuenta. La importación de escritorio guarda elementos históricos en `knowledge_imported_items`, distintos de las entradas activas. La captura selecciona el documento original y todas las entradas de su índice y comprueba que pertenezcan a la cuenta y estén disponibles. La recuperación crea copias mediante recibos idempotentes, genera identidades nuevas para documentos y entradas y remapea las referencias del plan. Un reintento no sobrescribe un índice editado ni recrea un documento eliminado. Un fallo durante la transferencia puede dejar copias parciales de conocimiento para reintentar. Las referencias sin fuente recuperable impiden la creación del proyecto.

`web-api/src/project-knowledge-snapshot.js` selecciona las carpetas, documentos, revisiones y todas las entradas de los documentos referenciados, con aislamiento por propietario; rechaza referencias ausentes, documentos eliminándose o sin original y límites excedidos. La captura incluye esos datos y los originales de R2, revisa los ETags y comprueba cambios antes de escribir el manifiesto. Las pruebas usan D1 y R2 en Miniflare.

`knowledge-index-restore.js` y la migración `0108` permiten a un runner autenticado crear un índice para un documento previamente importado por su cuenta, asignar nuevas identidades y recuperar el mismo mapa en reintentos concurrentes. Rechazan un documento eliminado o ausente y un índice editado posteriormente. El comando de recuperación usa este mapa para crear los capítulos; la API comprueba que las entradas pertenezcan a la cuenta de destino.

### Análisis y hechos pendientes de revisión

La captura incorpora hechos guardados, análisis técnicos y análisis históricos anteriores en la revisión del proyecto. Los identificadores de documentos de destino cambian, por lo que las conclusiones no se restauran como vigentes automáticamente: los análisis se conservan como históricos revisables y los hechos como copia pendiente de revisión. Se usan los recibos idempotentes existentes y se admiten capturas anteriores. El plan y sus capítulos se conservan. Las pruebas en Miniflare comprueban cambios, aislamiento, reintentos y contenido recuperado. Los hechos sin grupos se recuperan como estado vacío sin crear un registro de revisión.

### Historial de consultas

La captura conserva el historial importado y las preguntas, respuestas y sugerencias de las consultas web. No incluye la credencial ni restaura los trabajos como tareas: los que estaban activos quedan identificados como interrumpidos. La recuperación los guarda como historial de solo lectura mediante el recibo de importación existente; las nuevas consultas no reciben automáticamente esos mensajes. Las pruebas verifican aislamiento, reintentos y que no se crean trabajos de consulta.

### Vínculo SECOP

La captura incluye el proceso, la línea base, las alertas y las asociaciones entre documentos SECOP y archivos del proyecto, incluidas las entradas de ZIP. La recuperación comprueba antes de transferir que la cuenta de destino no tenga otro proyecto vinculado al mismo proceso, importa el vínculo con el recibo existente y remapea las asociaciones a los archivos nuevos. Los reintentos no sustituyen vínculos cambiados ni recrean archivos eliminados. La comprobación previa no reserva el proceso: una creación simultánea puede causar un conflicto posterior, dejando un proyecto parcial que se puede revisar. No se reanudan tareas ZIP en curso ni se incluyen otras funciones de seguimiento de cuenta.

### Oferta económica

La captura incorpora el borrador de oferta y detecta cambios de su versión durante la captura. La recuperación conserva el contenido, los identificadores de sus partidas y la fecha de actualización, y crea una versión inicial en el proyecto de destino. El recibo de importación permite reintentar sin sobrescribir ediciones posteriores. Las capturas anteriores siguen siendo compatibles; esto no convierte la captura parcial en una copia completa de la cuenta.

### Perfil de revisión anónima

La captura incluye el perfil personalizado y detecta cambios de su versión. La recuperación valida que el perfil pueda preservarse y lo crea con su fecha original y una versión inicial; el recibo permite reintentos sin reemplazar ediciones posteriores. Si no existía un perfil guardado, el proyecto recuperado utiliza el predeterminado. Las inspecciones históricas siguen fuera de esta captura parcial.

### Comparaciones RUP históricas

La captura incorpora las comparaciones importadas, sus fuentes PDF disponibles y el vínculo al requisito vigente. La recuperación conserva comparaciones múltiples del mismo requisito y mantiene sin vínculo las que apuntaban a un requisito eliminado. Las fuentes se descargan con ETag y se verifica que la captura no cambie; los reintentos no duplican comparaciones. La importación rechaza antes de crear el proyecto los PDF mayores de 25 MiB o los datos que no pueda preservar. Esta pieza no incluye el certificado RUP completo de la cuenta ni convierte la captura en un respaldo completo.

### Preferencias de cuenta

El runner puede capturar idioma y apariencia por separado con `capture-account-preferences --output RUTA_ABSOLUTA`. El formato es una captura parcial verificable sin credenciales ni otros datos de cuenta. `read-account-preferences` muestra la revisión actual de la cuenta vinculada al runner; `restore-account-preferences --snapshot RUTA_ABSOLUTA --expected-revision N` exige esa revisión para restaurar únicamente las preferencias en la cuenta de destino. Cada cambio de preferencias incrementa la revisión y una modificación concurrente provoca conflicto. La restauración es explícita y sustituye las cuatro preferencias si la revisión coincide; repetirla exige obtener la revisión nueva. Las pruebas usan Miniflare y dos cuentas. Los archivos de captura no están cifrados y el hash detecta cambios accidentales, no autentica el origen. Esto no es un respaldo completo de cuenta.

### Evaluaciones de ofertas

La captura parcial incluye los informes de evaluaciones terminadas, sus revisiones humanas y los estados de las tareas; las activas se recuperan como interrumpidas. Los informes se transmiten por flujo y se comprueban contra su SHA-256. La recuperación valida antes de crear el proyecto y utiliza recibos idempotentes; no sobrescribe revisiones posteriores ni recrea informes eliminados. Una eliminación pendiente o un informe ausente impide la captura. No incluye credenciales y sigue sin ser un respaldo completo de la cuenta.

### Perfil de empresa

La captura parcial independiente `capture-account-company-profile --output RUTA_ABSOLUTA` incluye el perfil guardado y sus imágenes, incluso cuando hay imágenes sin perfil. `restore-account-company-profile --snapshot RUTA_ABSOLUTA` los recupera sin sustituir un perfil existente; los recibos permiten reintentos sin duplicar ni recrear imágenes eliminadas. Se comprobó con Miniflare y el runner empaquetado. El contenido queda sin cifrar, no incluye credenciales ni otros datos de cuenta y no constituye un respaldo completo. D1 y R2 no proporcionan una captura transaccional conjunta.

### Biblioteca de imágenes de la cuenta

La captura parcial independiente `capture-account-image-library` incluye las imágenes compartidas y conserva los registros con originales ausentes. `restore-account-image-library` los recupera mediante recibos idempotentes, sin sustituir imágenes existentes ni recrear las eliminadas. La prueba con Miniflare cubre el aislamiento entre cuentas, objetos cambiados, corrupción y reintentos. Los archivos locales no están cifrados y D1 y R2 no proporcionan una instantánea conjunta; no es un respaldo completo.

### RUP vigente

La captura parcial independiente `capture-account-rup` guarda el PDF vigente y sus hechos revisados; `restore-account-rup` los importa sin sustituir el RUP vigente de la cuenta de destino. Un recibo idempotente evita duplicados y conserva ediciones posteriores; una captura vacía no borra datos. La captura no incluye historiales de certificados, credenciales ni otros datos y no constituye un respaldo completo. El PDF y los datos quedan legibles; las comprobaciones no producen una instantánea atómica entre D1 y R2.

Los soportes RUP de proyectos restaurados con esta versión se vuelven a vincular al certificado recuperado de la misma cuenta si coincide su identidad de origen y sigue vigente. Si el RUP se restaura después, repetir la recuperación del proyecto resuelve los soportes sin cambios manuales. Al reintentar una captura restaurada antes de esta mejora, se reconstruye el mapa solo para soportes sin editar que todavía coinciden con los datos originales; los demás deben vincularse manualmente.

### Certificados de empresa

`capture-account-certificates` captura certificados e imágenes; `restore-account-certificates` los recupera mediante recibos idempotentes sin reemplazar ediciones ni recrear elementos borrados. Los soportes de proyectos recuperados se vinculan por identidad de origen a certificados importados de la misma cuenta; si los certificados se recuperan después se debe repetir la recuperación del proyecto. Los soportes modificados no se sustituyen. Los archivos quedan legibles y la captura es parcial, no atómica y sin credenciales.

Si hay varias copias recuperadas del mismo certificado de origen, el soporte permanece sin vincular para que el usuario seleccione la copia correcta.
