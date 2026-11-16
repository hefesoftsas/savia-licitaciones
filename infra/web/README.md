# Infraestructura web de Savia

OpenTofu administra una base D1 y un bucket R2 por entorno. Ambos tienen `prevent_destroy`: una eliminación o reemplazo requiere una decisión explícita y respaldo verificado. Puede asociar un dominio propio a un Worker **ya publicado**; la opción está desactivada inicialmente. El estado de OpenTofu debe guardarse en un backend privado y respaldado: el estado local no es adecuado para trabajo compartido.

Wrangler administra la publicación del Worker, los recursos estáticos, el binding de correo y el Durable Object `PREVIEW_WAKE` con su migración. La salida `wrangler_config` toma la plantilla web versionada y reemplaza los nombres e ID de D1/R2 y los valores públicos del entorno. No crea servicios de inferencia ni runners en la nube. Las claves y secretos no forman parte de las variables ni de la salida.

## Preparar y validar sin desplegar

1. Copia `terraform.tfvars.example` a un archivo de variables privado fuera del repositorio y completa los valores del entorno. Para evitar recursos duplicados, comprueba si ya existen y, si corresponde, impórtalos al estado antes de aplicar.
2. Configura un token de Cloudflare mediante `CLOUDFLARE_API_TOKEN` con los permisos necesarios para los recursos seleccionados, sin permisos `ai:write` ni `ai-search:run`. No guardes el token en los archivos de variables o en el repositorio.
3. Desde `infra/web`, ejecuta `tofu init`, `tofu validate` y `tofu plan -var-file=/ruta/privada/variables.tfvars`. Revisa cuidadosamente las acciones y costos. El plan no crea recursos.
4. Para probar el contrato sin credenciales ni acceso remoto, usa `tofu test`: son planes con un proveedor simulado y no verifican la cuenta ni el estado real de Cloudflare.

## Después de aprobar un despliegue futuro

Después de aplicar los recursos, genera la configuración con `tofu output -json wrangler_config > ../../web-api/wrangler.web.generated.json`. El archivo se ubica junto a la plantilla para que las rutas relativas de `main`, `assets` y migraciones funcionen. Verifica el remitente en Cloudflare Email Service y configura por separado los secretos `BETTER_AUTH_SECRET`, `CREDENTIAL_KEY_HEX`, `BACKUP_CONTROL_TOKEN` y, cuando corresponda, `CREDENTIAL_PREVIOUS_KEYS_JSON`; no los escribas en la configuración generada. Aplica las migraciones D1 con la configuración generada y publica el Worker con Wrangler. Solo después habilita el dominio, revisa un nuevo plan y aplícalo. Comprueba autenticación, almacenamiento, correo, aislamiento, respaldo y recuperación antes de usar datos reales.

### Preparar una exportación D1 para una restauración aislada

Algunas exportaciones de Wrangler intercalan cada tabla con sus datos. Si una tabla hace referencia a otra que todavía no se ha creado, la importación puede fallar. Para preparar el SQL de una exportación para una **base nueva y vacía**, ejecuta `python3 infra/web/d1_restore.py export.sql restauracion.sql` desde la raíz del repositorio. La herramienta crea el archivo con permisos privados, no sobrescribe uno existente y rechaza sentencias que no reconoce. Importa el resultado solo en una base de recuperación aislada y ejecuta `PRAGMA foreign_key_check;`; comprueba además los datos y archivos esperados. Pruebas: `cd infra/web && python3 -m unittest -v test_d1_restore`.

### Captura y restauración de QA

La barrera `BACKUP_GATE` bloquea las solicitudes `/api/`, incluidas las lecturas que pueden actualizar datos, y espera a que las solicitudes admitidas terminen. La configuración generada la habilita; requiere dos llamadas al Durable Object por solicitud y esto afecta la latencia y el costo. El secreto `BACKUP_CONTROL_TOKEN` se configura por separado y nunca va en el repositorio. La barrera no controla accesos directos a D1/R2, otros Workers ni herramientas de administración: antes de capturar, el operador debe garantizar que no haya otros escritores durante toda la operación. Una solicitud interrumpida puede dejar una concesión activa; el respaldo se detiene sin crear un marcador de finalización.

Los comandos siguientes están restringidos por nombre al entorno de QA de esta instalación. No se deben usar como un sistema de respaldo de producción:

1. `node infra/web/qa_backup.mjs /ruta/privada/qa-gated-worker.json savia-web-runner-qa-backup /ruta/privada/directorio-nuevo` bloquea y drena la API, exporta D1 y copia los objetos a un prefijo único del bucket de respaldo. Comprueba tamaño y SHA-256 de cada copia y crea `complete.json` solo después de liberar la barrera. El SQL, el manifiesto y el archivo de recuperación tienen permisos privados y pueden contener datos sensibles. La exportación D1 queda en el directorio local; protégela y conserva otra copia fuera de la cuenta. Las huellas detectan cambios accidentales, no autentican un manifiesto manipulado.
2. Crea una D1 y un bucket R2 de recuperación nuevos y vacíos con nombres `savia-web-runner-qa-restore-*`. `node infra/web/qa_restore.mjs /ruta/privada/qa-gated-worker.json /ruta/privada/directorio-nuevo D1_NUEVA R2_NUEVO` exige el marcador y las huellas, comprueba que los destinos estén vacíos, restaura los archivos y después D1, y ejecuta `PRAGMA foreign_key_check`. Si falla, conserva los destinos parcialmente restaurados para diagnóstico y usa recursos nuevos al reintentar.
3. Si el proceso de captura se interrumpe y deja `lock-recovery.json`, verifica primero que el proceso y cualquier otro escritor hayan terminado. `node infra/web/qa_unlock.mjs /ruta/privada/directorio-nuevo` solo libera el bloqueo correspondiente y se niega mientras el proceso registrado siga activo. Una captura interrumpida no tiene marcador de finalización y no debe restaurarse.

Guarda `BETTER_AUTH_SECRET`, `CREDENTIAL_KEY_HEX` y las claves anteriores de cifrado necesarias en un almacén seguro separado; sin ellas no se pueden recuperar correctamente sesiones y credenciales. El bucket de respaldo en la misma cuenta no protege contra la pérdida de toda la cuenta. Antes de producción faltan una estrategia de copias fuera de esa cuenta, retención, pruebas periódicas, control de accesos externos y una versión de los comandos que no esté limitada a QA.

La configuración y el procedimiento anterior se probaron en recursos aislados de QA. El generador depende de que la plantilla Wrangler sea JSON válido y esté disponible en el repositorio durante el plan.
