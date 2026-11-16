# Licenciamiento para Savia Desktop

Estado: diseño aprobado con máximo de tres equipos activos, tres días sin conexión y reserva del cupo durante la desconexión. No autoriza despliegue ni modifica licencias existentes.

## Objetivo y alcance

Proteger el acceso a las funciones de Savia con una clave de licencia, conservando la aplicación y los documentos en el computador. El propietario eligió activación en línea con uso temporal sin conexión. Las licencias deben poder emitirse, renovarse, revocarse y trasladarse a otro equipo. El servicio recibe únicamente los datos necesarios para licenciamiento: nunca documentos, prompts ni claves de modelos. No añade telemetría ni cambia el proveedor OpenCode Go.

**Decisión del propietario:** una clave puede utilizarse en distintos computadores, con un máximo de tres activaciones de uso simultáneas. Al alcanzar el límite se muestra un mensaje claro con opciones para liberar un cupo. No es una licencia permanentemente atada a un equipo.

**Período sin conexión aprobado:** tres días desde la última renovación válida. Cada autorización offline conserva un cupo hasta que venza o se libere estando en línea. Una liberación administrativa anticipada no puede invalidar inmediatamente una copia desconectada: admitir otro acceso antes del vencimiento puede superar temporalmente el máximo. La autorización temporal nunca supera la vigencia de la licencia comercial.

## Alternativas

1. Certificado firmado totalmente offline: no requiere servicio, pero limita mucho la revocación y el control de equipos.
2. **Activación en línea con autorización firmada temporal y funcionamiento offline:** permite revocación y límites de equipos sin depender continuamente de internet; requiere operar un servicio. Es la opción elegida para el diseño.
3. Validación en cada operación: facilita control inmediato, pero bloquea al usuario ante interrupciones de red y no satisface el uso sin conexión.

## Diseño propuesto

### Servicio de licencias

- Servicio independiente y aislado del antiguo endpoint de analítica; no reutilizar la ruta histórica, que acepta el plan indicado por el cliente y no comprueba una clave comercial. No habilitar servicios de anuncios, telemetría ni otros servicios desconectados. El servicio puede ejecutarse en Cloudflare Workers con almacenamiento transaccional, sujeto a configuración y autorización de despliegue posteriores.
- Generar claves aleatorias de alta entropía; almacenar únicamente un identificador y un verificador derivado mediante HMAC con secreto del servidor. La clave completa se muestra una sola vez al emisor y nunca se registra en logs. Las credenciales de administración y firma viven en secretos del servicio, no en el repositorio ni el cliente.
- Mantener licencias con estado, vigencia y máximo de dispositivos, y activaciones con identificador aleatorio de instalación, clave pública del dispositivo, fechas y estado. Crear o revocar activaciones de forma transaccional para que dos solicitudes simultáneas no superen el límite. Definir índices únicos, límites de solicitudes y mensajes sin revelar si una clave existe.
- API mínima versionada: activar, renovar, desactivar y consultar estado. Para renovar o desactivar, el dispositivo demuestra posesión de su clave privada con un desafío único de vida corta y firma; el servidor rechaza desafíos usados o vencidos. Las operaciones deben ser idempotentes cuando un cliente reintenta tras fallos de red. Todas las llamadas usan HTTPS.
- La activación emite una autorización firmada por el servidor que incluye producto, versión de esquema, identificador de licencia y activación, clave pública o identificador de dispositivo, fecha de emisión, vencimiento de la licencia y vencimiento de la autorización temporal. El plan y los permisos provienen únicamente del registro del servidor. La aplicación contiene solo la clave pública de verificación; se define identificación y rotación de claves con pruebas cruzadas.
- Crear herramientas administrativas mínimas para emitir, consultar y revocar claves y liberar equipos, con autenticación separada, privilegios mínimos y auditoría sin secretos. Los clientes no pueden crear, ampliar ni cambiar licencias. El proceso de operación y recuperación se documentará; no se asume que el endpoint histórico o su dominio pertenezcan a Savia.

### Cliente de escritorio

- Generar un par de claves único por instalación. Proteger la clave privada local con la protección disponible del sistema operativo y verificar el comportamiento real de la versión de Electron usada en el proyecto. La protección local reduce exposición a otros usuarios, pero no evita que el dueño de la cuenta o de la máquina extraiga o modifique el cliente.
- Al introducir la clave, activar mediante el servicio y guardar únicamente la autorización firmada y el material protegido indispensable para renovarla. La aplicación comprueba firma, producto, instalación, vigencia y fechas en Electron Main antes de conceder permisos. La clave comercial no debe aparecer en registros, mensajes de error ni en el Renderer después de su envío.
- Una revocación o desactivación autenticada debe invalidar de inmediato la autorización local, incluso si su vencimiento aún no llega. Usar un identificador de generación de activación y una secuencia monotónica para que una renovación iniciada antes de revocar no restaure el acceso; aplicar de forma atómica los cambios locales.
- Renovar al estar disponible la red. Sin red o ante una caída temporal, mantener el acceso solo hasta que expire la autorización ya firmada; informar claramente el tiempo restante y permitir reintentos. Una revocación explícita recibida del servidor impide renovaciones posteriores. Si vence la autorización offline, solicitar conexión y renovación.
- Si la protección segura del sistema no está disponible, no guardar la clave privada en texto plano ni simular activación: informar el problema y permitir reintento o recuperación. Las copias del perfil no garantizan vinculación física al hardware; la clonación, la restauración de respaldos y la manipulación del reloj entre reinicios pueden evadir algunos controles offline.
- Detectar retrocesos relevantes del reloj mediante el último tiempo confiable y el tiempo transcurrido cuando el sistema lo permita; tratar inconsistencias solicitando conexión, sin afirmar que esto impide toda manipulación. Mantener distinción entre licencia revocada, expirada, error de conexión, límite de equipos y error de validación.
- Aplicar el control en Main a los puntos de entrada de las funciones licenciadas, además del estado visual. Sin licencia válida, seguir permitiendo activación, diagnóstico y acceso o exportación de documentos existentes, sin borrarlos. Detallar las operaciones exactas antes de implementar para no impedir recuperación de datos.
- Ofrecer en Ajustes introducción de clave, estado, vigencia, próxima renovación, desactivación del equipo y errores accionables en español e inglés. En el límite de tres, mostrar que los cupos están ocupados, cómo liberar uno y, si corresponde, cuándo vencerá la reserva; evitar mostrar información sensible de otros dispositivos. Desactivar un equipo requiere confirmación. Si no es posible contactar el servicio, indicar qué puede hacer el usuario y mantener el estado firmado vigente.

### Compatibilidad y distribución

- Inventariar todos los puntos IPC y de tareas que habilitan funciones, definir una política única en Main y verificar que no existan rutas alternativas sin comprobación; conservar accesibles activación y exportación de recuperación. No asumir que el aviso actual es una barrera de acceso.
- Separar explícitamente el modo de pruebas, que puede usar claves efímeras, del modo de distribución; la exención actual para aplicaciones no empaquetadas no puede aplicarse silenciosamente a una versión pública.
- No desactivar ni sustituir automáticamente licencias históricas sin definir una migración y comprobar que su emisor es legítimo. Durante el desarrollo usar claves y servidor de pruebas efímeros; nunca llaves de producción existentes.
- El repositorio declara AGPL-3.0: revisar las condiciones de distribución y cualquier contrato de licenciamiento con asesoría competente antes de publicarlas; el sistema no pretende impedir copias modificadas.
- La aplicación es de código abierto: un atacante con control del equipo puede modificar o recompilar el cliente y saltar controles locales. La firma del instalador y las autorizaciones verificables elevan el costo de distribución alterada, pero no convierten la protección en invulnerable. Las versiones actuales no tienen firma de sistema operativo configurada; esta debe planificarse aparte antes de distribución pública.
- No bloquear ni borrar archivos, ni asumir que las direcciones MAC son estables. Una reinstalación o cambio de equipo necesita un proceso explícito de liberación o recuperación; no registrar identificadores crudos de hardware.

## Verificación y criterios de aceptación

- Activación con clave válida; rechazo de claves incorrectas, revocadas y expiradas; renovación; rechazo de firmas alteradas y desafíos repetidos; límite atómico de tres con activaciones concurrentes, aviso al cuarto, liberación y reingreso, caída de red durante uso, revocación y reasignación de dispositivo. Verificar explícitamente la limitación de revocación de copias desconectadas y no afirmar concurrencia exacta fuera de línea.
- Pruebas de expiración con reloj inyectado, desconexión, caída del servicio, reconexión, tiempo adelantado/atrasado, reinicio y pérdida de almacenamiento seguro; nunca destruir datos existentes. Verificar que una respuesta tardía no reanude una licencia revocada.
- Comprobar que las funciones protegidas rechacen solicitudes en Main aunque se omita la interfaz, y que diagnóstico, activación y exportación de datos propios permanezcan accesibles. Ejecutar build y pruebas de IPC/Electron en Windows y macOS; pruebas automáticas locales no sustituyen las de versiones empaquetadas y firmadas.
- Probar con servicio local o de pruebas, secretos efímeros y datos ficticios. Ningún despliegue, emisión de claves reales, cambio de credenciales o activación de red en producción se efectúa sin la autorización pertinente.
