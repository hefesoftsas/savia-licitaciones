# Runner local de Savia — versión preliminar

Requiere Node.js 22.13 o posterior para la misma plataforma y arquitectura que indica `manifest.json`. Incluye el helper OpenXML para su plataforma y no necesita el SDK de .NET para usarlo. En Linux necesita glibc, ICU y las demás bibliotecas del runtime de .NET 10. La exportación Word del plan guardado utiliza este helper. Esta carpeta no contiene credenciales. El runner conserva su credencial de emparejamiento en el perfil del usuario, fuera de esta carpeta.

Abre `Iniciar-Savia.command` en macOS o `Iniciar-Savia.cmd` en Windows; en Linux ejecuta `./Iniciar-Savia.sh` desde una terminal. Si aún no está conectado, el asistente pedirá la dirección de Savia, el nombre del equipo y el código de conexión generado en la web. Después inicia el runner en esa ventana. No configura el inicio automático.

También puedes usar los comandos directamente. Desde esta carpeta, genera un código en Savia web y ejecuta:

```sh
node runner/cli.mjs pair --server https://DIRECCION-DE-SAVIA --name "Mi equipo"
```

Pega el código y pulsa Enter. Después ejecuta:

```sh
node runner/cli.mjs run
```

Déjalo abierto mientras necesites ejecutar tareas. Ctrl+C lo detiene. Mientras está libre, el runner intenta limpiar las cargas interrumpidas de su cuenta al iniciar y como máximo una vez por hora; con el runner apagado no hay limpieza automática. La conexión requiere HTTPS excepto en pruebas locales. Los resultados pendientes se guardan cifrados temporalmente junto a la configuración y se reenvían al iniciar. Una concesión vencida o cancelada no admite una entrega nueva: el resultado cifrado se conserva para revisión manual. Usa `node runner/cli.mjs outbox-list` para ver identificadores y `node runner/cli.mjs outbox-export --job ID --output /ruta/absoluta/nueva.json` para exportar uno; el archivo exportado contiene datos legibles. Se publica cuando la escritura termina; un cierre forzado puede dejar un temporal legible en la carpeta de destino. Después de comprobarlo, `node runner/cli.mjs outbox-discard --job ID --state rejected` retira la copia cifrada. Las copias recuperables admiten hasta 5.000.000 bytes de resultado serializado. Si un resultado excede ese límite, el runner avisa e intenta entregarlo, pero no conserva una copia local; las etapas técnicas que exigen copia se detienen. Si se pierde o cambia el token, la dirección del servidor o el identificador del runner, esas copias no pueden descifrarse. Detén todas las instancias antes de volver a emparejar. El runner no inicia servicios alojados ni cambia automáticamente de proveedor. Esta distribución aún requiere validación de instalación y operación en cada sistema antes de usarse en producción.

Las planificaciones y los borradores técnicos que aún no tienen confirmación se conservan en una bandeja cifrada independiente y se intentan entregar antes de reclamar otra tarea. Si la concesión venció o la tarea se canceló, al reanudar el mismo lote en este runner se intentará entregar la etapa conservada con la nueva concesión; el servidor vuelve a verificar la versión y las fuentes. Si no se puede recuperar, consulta `node runner/cli.mjs outbox-list --kind draft` y exporta el contenido con `node runner/cli.mjs outbox-export --kind draft --job ID --output /ruta/absoluta/nueva.json`; el archivo exportado es legible. Después de revisarlo puedes retirar la copia con `node runner/cli.mjs outbox-discard --kind draft --job ID --state rejected`. La tarea interrumpida puede requerir reanudación desde la web.

Las consultas admiten texto, PDF con texto seleccionable, DOCX, XLS y XLSX. DOC y WPS pueden requerir LibreOffice u otro conversor local compatible. PDFs escaneados requieren texto previo.

## Iniciar al entrar en la sesión

En Windows, macOS y Linux con systemd de usuario, después de conectar el equipo, detén cualquier runner que tengas abierto y ejecuta `node runner/cli.mjs service-install` desde esta carpeta. El comando inicia el runner y configura su inicio al entrar en la sesión del usuario. Para detenerlo y retirar el inicio automático ejecuta `node runner/cli.mjs service-remove`. Si se pierde la conexión, el runner sigue reintentando; si se revoca la credencial o ocurre un error terminal, se detiene y no se reinicia en bucle. La sesión del usuario debe estar activa y la carpeta del runner y Node deben permanecer en la misma ruta. En Linux se necesita systemd de usuario activo; en Windows se utiliza el Programador de tareas para la sesión del usuario. No inicies otra copia manual mientras el servicio esté activo.

## Comprobar el runner

Ejecuta `node runner/cli.mjs doctor` para revisar la versión de Node, plataforma, archivos de herramientas y su integridad cuando existe un manifiesto, la carga de la dependencia nativa de imágenes y el estado local de emparejamiento. Si la dependencia de imágenes no carga, utiliza una distribución preparada para el sistema y la arquitectura del equipo. No envía datos ni muestra credenciales. Un aviso de configuración ausente es normal antes de emparejar. La comprobación no prueba conexión al servidor, acceso al modelo ni ejecución completa; las herramientas externas indicadas por el entorno se muestran sin verificación de integridad.

## Capturar componentes de la cuenta

Con el equipo conectado, `node runner/cli.mjs capture-account-components --output /ruta/absoluta/nueva` guarda en subcarpetas preferencias, perfil, imágenes, RUP, certificados, formato, biblioteca, PAA, experiencia y viabilidad. Es una captura parcial: no incluye proyectos, credenciales ni todos los demás datos; sus componentes se obtienen en momentos diferentes y quedan sin cifrar. La carpeta debe ser nueva. Si falla un componente, se conservan los anteriores y no se publica el índice final.

Para capturar los proyectos de la cuenta vinculada, ejecuta `node runner/cli.mjs capture-account-projects --output /ruta/absoluta/nueva` en otra carpeta nueva. Admite hasta 10.000 proyectos y compara el inventario antes de publicar el índice; los proyectos se capturan en momentos diferentes, por lo que no es una instantánea atómica. Una falla o cambio detectado conserva las capturas terminadas sin publicar el índice. Para recuperar un conjunto terminado en la cuenta vinculada usa `node runner/cli.mjs restore-account-projects --snapshot /ruta/absoluta/captura`. La operación muestra los IDs de origen y destino; si se interrumpe puede dejar proyectos recuperados y se puede repetir sin reemplazar ediciones posteriores. Para vincular una captura de biblioteca compartida añade `--knowledge-snapshot /ruta/absoluta/biblioteca`. Las capturas sin índice se recuperan individualmente con `restore-project-components`. Los archivos quedan sin cifrar y la captura es parcial.

Para recuperar un conjunto terminado, conecta el runner a la cuenta de destino, consulta la revisión con `node runner/cli.mjs read-account-preferences` y ejecuta `node runner/cli.mjs restore-account-components --snapshot /ruta/absoluta/captura --expected-revision N`. El comando comprueba integridad y revisión antes de empezar, muestra el resultado de cada componente y sustituye las preferencias al final. Si se interrumpe puede dejar cambios parciales: consulta de nuevo la revisión antes de repetir y revisa los resultados. Una captura sin índice se puede recuperar por subcarpetas con los comandos individuales documentados más adelante. La operación no restaura una cuenta completa.

## Importar un plan de escritorio

Abre en Savia de escritorio **Ajustes → Carpeta de configuración** para identificar la ruta de datos y cierra Savia completamente. Con esa ruta absoluta, consulta las empresas y crea un archivo nuevo en una carpeta distinta:

```sh
node runner/cli.mjs list-desktop-companies --user-data "/RUTA/DATOS/SAVIA"
node runner/cli.mjs create-backup --user-data "/RUTA/DATOS/SAVIA" --company ID_EMPRESA --output "/OTRA/RUTA/respaldo.savia"
```

El respaldo contiene información empresarial sin cifrar. Consérvalo en un lugar protegido. La captura comprueba el bloqueo del perfil y no sobrescribe un archivo existente.

Con el respaldo creado y el runner emparejado, consulta los proyectos disponibles:

```sh
node runner/cli.mjs inspect-backup --backup /ruta/absoluta/respaldo.savia
```

Copia el `sourceId` del plan y ejecuta:

```sh
node runner/cli.mjs import-plan --backup /ruta/absoluta/respaldo.savia --project ID_DEL_PLAN
```

La operación crea un proyecto web nuevo y no modifica el respaldo ni el espacio local. Los reintentos del mismo archivo y plan recuperan el mismo proyecto. La importación incluye capítulos, hechos globales, análisis, imágenes y originales de licitación disponibles de hasta 25 MiB por archivo; también incluye la etapa, tareas, requisitos, oferta económica y comparaciones históricas del proceso asociado cuando se puede identificar. Revisa los hechos y sus soportes en la web antes de usarlos; confirmarlos conserva los capítulos. Los datos web existentes no se reemplazan. El resultado informa archivos ausentes, externos o demasiado grandes. Si falla una transferencia, repite el mismo comando para continuar sin duplicados. Las tareas de generación, sesiones y otros datos aún no se trasladan. La captura desde la interfaz gráfica de escritorio todavía está pendiente.

Para importar el RUP actual y sus datos revisados, usa `node runner/cli.mjs import-rup --backup /ruta/absoluta/respaldo.savia`. El comando no reemplaza un certificado web existente. Las comparaciones del plan son históricos para revisar; si falta su PDF o no hay vínculo verificable con el requisito, la web lo indica.

Para importar la biblioteca documental, usa `node runner/cli.mjs import-knowledge --backup /ruta/absoluta/respaldo.savia`. Los originales disponibles y las entradas históricas se transfieren a la cuenta. Si un original falta, sus entradas permanecen consultables y el documento no se puede descargar ni analizar. Las entradas históricas quedan separadas del índice aceptado y requieren revisión.

Puedes adjuntar un archivo a un registro sin original desde la biblioteca web. Verifica que sea el documento correspondiente: las entradas históricas no se convierten automáticamente en citas aceptadas.

Cada importación intenta limpiar cargas interrumpidas elegibles. Para iniciar la limpieza manualmente, ejecuta `node runner/cli.mjs cleanup-imports`. Una carga activa se considera vencida después de una hora. Si no se pudo confirmar que terminó, se conserva un registro para comprobarlo de nuevo después de 24 horas en una importación posterior o al repetir el comando. No hay una tarea programada de limpieza.

Los análisis del pliego también se importan como resultados históricos consultables. Sus fuentes pueden estar incompletas. El usuario puede revisar y aceptar los tres resultados compatibles para generar el índice, seleccionando los documentos que comprobó; esta aceptación puede reemplazar un análisis de la misma categoría tras confirmación. Las tareas antiguas no se reanudan.

El runner guarda las imágenes PNG, JPEG, GIF y WebP referenciadas que estén disponibles en el respaldo e informa las que no puede cargar. La vista previa web muestra las imágenes guardadas del proyecto sin cargar imágenes externas. Word recupera las imágenes desde la nube y convierte WebP estático a PNG; si alguna imagen no se puede incorporar, incluido WebP animado, muestra un aviso.

Las evaluaciones históricas de ofertas se importan con `import-plan` o `import-saved-tenders` cuando pertenecen inequívocamente al proyecto. Se conservan criterios, fuentes y revisiones humanas; las tareas en curso quedan interrumpidas. Los originales disponibles y el texto extraído se transfieren como documentos. El resultado indica los originales ausentes; conserva el respaldo para recuperarlos. Un reintento no sobrescribe revisiones ni recrea evaluaciones eliminadas.

El comando `node runner/cli.mjs import-feasibility --backup /ruta/absoluta/respaldo.savia` importa el informe de viabilidad y sus fuentes disponibles sin reemplazar un informe web existente. Informa las fuentes ausentes y permite reintentar una transferencia parcial. El estado estructurado tiene un límite de 1,5 MB y cada fuente de 25 MiB. La interfaz permite revisar fuentes y editar el contenido existente; la generación con IA todavía está en desarrollo. La exportación Word utiliza el runner local y avisa cuando faltan imágenes.

Para importar el perfil de empresa, ejecuta `node runner/cli.mjs import-company-profile --backup /ruta/absoluta/respaldo.savia` con el runner emparejado. El comando conserva los campos de texto y la preferencia de marca de agua, sin reemplazar un perfil web existente; repetirlo no revierte cambios posteriores. Las imágenes disponibles se transfieren por categoría. El resultado informa las retiradas y las ausentes o incompatibles; reintentar no recrea las que se retiraron en la web. `inspect-backup` informa si existe un perfil sin mostrar sus valores.

Para importar proyectos de experiencia empresarial, ejecuta `node runner/cli.mjs import-company-experience --backup /ruta/absoluta/respaldo.savia`. Los registros se conservan separados de las licitaciones y los reintentos no revierten cambios ni recrean registros eliminados. `inspect-backup` muestra cantidades sin revelar los datos. El comando transfiere los originales disponibles y devuelve `importedImages`, `removedImages` y `missingImages` para informar elementos retirados, ausentes o incompatibles.

Al iniciar `run` o `run-once`, el runner elimina espacios temporales identificados de procesos terminados cuando tienen al menos una hora. Conserva los activos, recientes o no verificables y no elimina carpetas sin esa identificación. Si una limpieza falla, informa y vuelve a intentarla al iniciar. Los restos anteriores a esta función no se reconocen automáticamente.

### Captura parcial del perfil de empresa

Con el runner vinculado a la cuenta de origen, ejecuta `node runner/cli.mjs capture-account-company-profile --output RUTA_ABSOLUTA_NUEVA`. Para recuperar el perfil y sus imágenes en otra cuenta vinculada, ejecuta `node runner/cli.mjs restore-account-company-profile --snapshot RUTA_ABSOLUTA`. La recuperación no sustituye un perfil existente; los reintentos no recrean imágenes eliminadas. Esta captura no incluye otras partes de la cuenta ni credenciales, no está cifrada y no es un respaldo completo. Guarda la carpeta en un lugar seguro.

**Kimi API (China)** usa una credencial y endpoint de China continental independientes de Kimi internacional. Revisa las condiciones, facturación y disponibilidad de tu cuenta; no hay cambio automático entre regiones.

Las consultas y otras tareas que extraen texto descargan los originales por flujo al espacio temporal del runner. El texto plano está limitado a 25 MiB; cada tarea y conversor puede tener límites adicionales. La comparación de duplicados, las plantillas y la revisión anónima también reciben los originales por flujo. Las reglas de color leen el DOCX en memoria y la corrección mantiene la copia resultante en memoria para enviarla.

Las copias de revisión anónima mayores de 25 MiB se envían por partes, hasta el límite de 1 GiB. La captura parcial de proyectos también puede recuperar copias de revisión de hasta 1 GiB mediante transferencia por partes. Antes de la entrega, el runner conserva una copia cifrada local hasta confirmar el resultado. El tamaño máximo y los conversores no se han probado en Cloudflare real.

Si se interrumpe la entrega de una copia grande, consulta `node runner/cli.mjs outbox-list --kind artifact` y expórtala con `node runner/cli.mjs outbox-export --kind artifact --job ID --output /RUTA/NUEVA.docx`. El archivo exportado queda legible; guárdalo en un lugar protegido. Tras comprobarlo, retira la copia cifrada con `node runner/cli.mjs outbox-discard --kind artifact --job ID --state pending`. Mantén la configuración y el token originales: cambiarlos impide descifrar la copia, y el runner bloquea el reemparejamiento mientras haya copias. El runner intenta recuperar automáticamente la entrega si la concesión sigue vigente; si venció, conserva el archivo para exportación manual. El informe de recuperación cifrado admite hasta 5.000.000 bytes; si supera ese límite, solo se conserva el documento para exportación manual. Una interrupción durante la exportación puede dejar un archivo temporal legible en la carpeta de destino.

Durante la recuperación automática, el runner descifra temporalmente la copia en un espacio de trabajo local protegido y lo elimina al terminar. Si el proceso se interrumpe bruscamente, el siguiente inicio intenta limpiar los espacios abandonados de más de una hora.

Para capturar la biblioteca de imágenes de la cuenta, ejecuta `node runner/cli.mjs capture-account-image-library --output /ruta/absoluta/nueva`. En la cuenta vinculada al runner de destino, `node runner/cli.mjs restore-account-image-library --snapshot /ruta/absoluta/nueva` recupera imágenes y registros con originales ausentes sin sobrescribir imágenes existentes. Repetir el comando no duplica ni recrea imágenes eliminadas después de la importación. La carpeta contiene archivos legibles, no incluye credenciales ni el resto de la cuenta y no es un respaldo completo. D1 y R2 no forman una instantánea atómica; se detectan cambios observados durante la captura. La comprobación consulta los objetos individualmente y aún no se han medido los límites ni los costos para bibliotecas grandes.

Para capturar el RUP vigente y sus datos revisados, ejecuta `node runner/cli.mjs capture-account-rup --output /ruta/absoluta/nueva`. Con el runner vinculado a la cuenta de destino, `node runner/cli.mjs restore-account-rup --snapshot /ruta/absoluta/nueva` importa el certificado solo si el destino no tiene uno vigente; los reintentos no reemplazan las ediciones posteriores. Una captura sin RUP no borra el del destino. Es una captura parcial sin credenciales: contiene datos y PDF legibles, no es un respaldo completo y D1 y R2 no forman una instantánea atómica.

**MiniMax API (China)** utiliza el endpoint de China del catálogo Pi y una credencial propia; es independiente de MiniMax internacional. Consulta las condiciones, disponibilidad y facturación de tu cuenta. El runner no cambia de región automáticamente.

**Vertex AI Express** utiliza una clave de Google Cloud para el modo exprés y el endpoint global de Vertex. Comprueba modelos, facturación y condiciones de datos. Esta integración no usa credenciales predeterminadas locales ni cambia a Gemini API si falla.

Para capturar los certificados de la cuenta y sus imágenes, ejecuta `node runner/cli.mjs capture-account-certificates --output /ruta/absoluta/nueva`. Con el runner de la cuenta de destino, `node runner/cli.mjs restore-account-certificates --snapshot /ruta/absoluta/nueva` los recupera sin sobrescribir ediciones ni recrear registros eliminados. Si un proyecto recuperado tiene soportes vinculados a esos certificados, repite la recuperación del proyecto para resolver los vínculos que sigan sin editar. Los archivos de captura son legibles y no incluyen otras áreas ni credenciales; no forman un respaldo completo ni una instantánea atómica entre D1 y R2.

Si hay varias copias recuperadas del mismo certificado de origen, el soporte permanece sin vincular para que el usuario seleccione la copia correcta.

El runner usa un bloqueo local por configuración para evitar que dos procesos ejecuten tareas o modifiquen simultáneamente sus bandejas. `run`, `run-once`, `pair`, `outbox-export` y `outbox-discard` avisan si hay otra instancia; `service-install` comprueba el bloqueo antes de solicitar el inicio, `outbox-list` sigue disponible. Un bloqueo con propietario terminado se recupera automáticamente. Si el propietario no puede verificarse o quedó un directorio `.lock.reap` tras una interrupción, comprueba que todos los procesos de esa configuración estén detenidos antes de retirar manualmente las carpetas `.lock` y `.lock.reap` junto al archivo de configuración. El archivo `owner.json` contiene PID e identificador aleatorio, sin token.

`node runner/cli.mjs capture-account-feasibility --output /ruta/absoluta/nueva` captura el estado de viabilidad, originales de cuenta, fuentes históricas disponibles, recursos y extracciones terminadas. Conserva los registros de fuentes históricas faltantes. La restauración de esta captura todavía no está disponible: conserva las fuentes originales y no dependas de ella como único respaldo. Es una captura parcial sin credenciales, bibliotecas compartidas ni historial completo de tareas; sus archivos son legibles y D1 y R2 no constituyen una instantánea atómica.
