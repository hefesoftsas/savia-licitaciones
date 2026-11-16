# Inventario inicial para Savia web

Base inspeccionada: `dcbc8d7`, esquema SQLite de ejecución versión 64. Este inventario es un punto de partida; no certifica paridad y debe actualizarse cuando se integren los cambios pendientes del checkout original.

| Área | Estado actual y consecuencia para web |
| --- | --- |
| Interfaz | React/Vite en `client/src`; `main.tsx` monta proveedores y `WorkspaceDatabaseGate`. El renderer referencia `window.savia` en cientos de lugares y el preload agrupa numerosas llamadas y suscripciones IPC. Hay que proporcionar contratos de red compatibles o migrar consumidores de forma explícita. |
| Navegación | `app/AppRouter.tsx` y `menuConfig.ts` reúnen oportunidades y recomendaciones SECOP, agenda, mercado, biblioteca, asistente de oferta, plan técnico, chat, factibilidad, plantillas, bibliotecas, revisiones, evaluación, plugins y ajustes. También existen ventanas y herramientas de desarrollador. Cada flujo necesita pruebas de paridad. |
| Datos | `electron/services/sqliteDatabase.cjs` crea y migra SQLite local; numerosos stores dependen de su conexión síncrona y del sistema de archivos local. Reemplazar SQLite por D1 no es un cambio de configuración: hay que rediseñar sus contratos y migrar los datos con sus relaciones y archivos. |
| Aislamiento | El escritorio opera dentro de una frontera local y la configuración actual no implementa el aislamiento de una API multiusuario. El servidor web debe asociar datos, tareas, runners y credenciales al usuario o espacio autorizado en cada solicitud. |
| Tareas | `taskIpc.cjs`, `taskService.cjs` y los servicios de Pi administran tareas largas, eventos, pausas, preguntas y persistencia; dependen de procesos y remitentes Electron. El protocolo remoto debe recuperar estado y eventos tras desconexión sin duplicar efectos. |
| Archivos | Importación, vista previa, exportación y rutas locales pasan por Main. El navegador necesita cargas y descargas, almacenamiento remoto y un contrato de archivos temporales para runner; no puede enviar rutas locales arbitrarias al servidor y esperar que existan. |
| Herramientas nativas | LibreOffice, OpenXML, renderizado local, Electron y `better-sqlite3` requieren adaptaciones o instalación en el runner. Verificar disponibilidad y empaquetado para Windows y macOS. |
| Proveedores | `aiService.cjs` gestiona colas y solicitudes; Pi se crea mediante `piSessionFactory.cjs`. El catálogo de Pi no está directamente expuesto por el puente actual. La ampliación de proveedores depende de conciliar las políticas vigentes y verificar términos y compatibilidad. |
| Preferencias web | Se encontraron accesos a `localStorage` en `features/changelog/services/changelogService.ts` y `shared/remoteNotice.ts`; corresponden a anuncios y cambios actualmente desconectados. No deben convertirse en fuente de verdad de la versión web. |
| Servicios en línea | La configuración histórica en `analytics/worker` contiene servicios heredados y cron. No debe reciclarse como si fuera la nueva API sin revisar protocolos, datos y alcance. Licencias es un Worker independiente y ya usa Wrangler local. |
| Tecnologías acordadas | Better Auth para identidad, Miniflare para emulación y pruebas locales. Los servicios concretos de almacenamiento de negocio deben validarse con los patrones y costos reales; el primer plan usa D1 para identidad. |

## Línea de base local

- `node scripts/install-dependencies.mjs`: correcto; 2251 referencias verificadas.
- `pnpm run setup:client`: correcto, Electron y `better-sqlite3` preparados en macOS arm64.
- `pnpm run smoke:electron-native`: correcto; SQLite se cargó y consultó bajo Electron.
- `pnpm run build`: correcto; Vite informó externalizaciones de módulos Node de una dependencia y el aviso de tamaño de chunks. Estas advertencias no prueban compatibilidad de todas las funciones con navegador.
- Tras agregar Better Auth y el harness local, `node scripts/install-dependencies.mjs` verificó 2302 referencias; el build del cliente y el smoke nativo terminaron con código 0.
- `pnpm run test:web-api`: correcto; registra dos usuarios en D1 emulado, verifica identidad aislada, cierre de sesión, reinicio del runtime y sesión caducada.
- `npm audit` desde `client/` devuelve `ENOLOCK` porque el monorepo no usa `package-lock.json`. `pnpm audit --audit-level=high` devuelve código 1 por el aviso de `joi` preexistente y dos avisos moderados de `glob`/`minimatch` en el cliente. La corrección local de `joi` está documentada en `DEPENDENCY_POLICY.md`; el informe del registro sigue identificando la versión publicada. No se ha demostrado aún el impacto de los avisos moderados en la ruta de uso de Pi.

## Avance local: proyectos y conexión del runner

- API inicial: proyectos privados en D1 y documentos en R2; autenticación por sesión y aislamiento por propietario. Las cargas actuales se leen en memoria y necesitan adaptación para archivos grandes.
- Emparejamiento: código temporal de un uso, token por runner almacenado como hash en D1, listado por usuario, heartbeat y revocación. Un cliente CLI local puede emparejarse y comprobar conexión; aún no recibe trabajos ni integra Pi.
- Las pruebas en Miniflare cubren dos usuarios, cargas y descargas, reinicio, limpieza ante fallo de D1, dos canjes simultáneos, caducidad, revocación y credenciales locales. No es una prueba de paridad con las funciones de escritorio.

- Cola inicial en D1: creación idempotente, reclamación exclusiva por tipos, renovación, cancelación, finalización idempotente y vencimiento seguro. El runner continuo ejecuta el cálculo de oferta económica ya existente. Las tareas de IA no se reclaman todavía; siguen pendientes la integración Pi, recuperación de entrega y paridad de interfaz.
- Credenciales: cifrado AES-GCM en D1 con clave externa e identificador; acceso por runner limitado a concesión vigente y selección explícita, con prueba de aislamiento, revocación y alteración. El runner puede obtener solo archivos seleccionados por tarea. La clave no rota aún y no se han implementado los adaptadores Pi ni métodos adicionales de proveedores.

- Consulta de licitación: el runner usa el runtime Pi, proxy, servicio de chat y parser local existentes con OpenCode Go; obtiene credencial y documentos por concesión, exige consentimiento y procesa texto, DOCX y PDF con texto seleccionable. Pruebas con respuestas simuladas sin red externa verifican herramientas Pi, transporte y cancelación. Faltan historial en nube, OCR y preguntas interactivas.

## Actividad del runner en la web

La interfaz consulta cada minuto los runners de la cuenta, compara su actividad con la hora del servidor e informa si no hay ninguno registrado o si no se ha observado actividad durante seis minutos. El aviso dirige a la configuración y aclara que las tareas esperan un runner compatible. Es una señal de actividad, no una garantía de conexión ni de compatibilidad; si falla la consulta no se presenta como una desconexión confirmada. El estado de los puntos anteriores es histórico y no constituye un inventario actualizado de paridad.

## Cambios sin confirmar del checkout original: revisión del 2 de noviembre

El checkout original conserva cambios locales que no están incorporados a esta base. Su plan `2026-10-31-flujo-integral-licitaciones.md` marca como implementados soportes por requisito, seguimiento de oportunidades con decisión, responsable y notas, vista mensual de agenda, comparación de dos a cinco evaluaciones y captura/restauración de empresas. El plan `2026-11-01-cierre-presentacion.md` también describe trabajo de lista previa y paquete de presentación, pero sus casillas siguen pendientes: no debe asumirse que todo ese plan esté terminado.

En este worktree existen seguimiento de trabajo, agenda, evaluaciones y transferencia de respaldos, pero la búsqueda de las tablas `secop_requirement_supports` y `secop_opportunity_tracking` y de los módulos `compareRuns` y `preflightChecklist` no encontró equivalentes directos en la API, el runner ni la interfaz web. No se ha demostrado la migración ni la paridad de esas capacidades: hay que contrastar los contratos y datos reales, preservarlos al importar respaldos y probar los flujos web antes de cerrar la épica. La ausencia de estos nombres no demuestra por sí sola que no exista ninguna función equivalente.

### Flujo integrado del sitio local

La prueba `pnpm run test:web-assets` compila el frontend y ejecuta el sitio con Wrangler y Miniflare: registro con Better Auth, proyecto, carga privada, credencial, emparejamiento y trabajo de consulta. El bucle real del runner descarga el documento y la credencial autorizados, ejecuta Pi con una respuesta de proveedor simulada y entrega el resultado; la cuenta puede leerlo y la bandeja temporal queda limpia. La prueba también comprueba el aislamiento de otra cuenta. No controla un navegador ni hace llamadas a un proveedor real, y no demuestra paridad de todos los módulos ni compatibilidad en otros sistemas.

### Verificación transversal posterior

En macOS ARM64, la suite del runner pasó 488 pruebas y omitió 8 sujetas a condiciones de entorno. La prueba con helper OpenXML real se ejecutó aparte y pasó; las pruebas de Linux requieren sus imágenes y dependencias locales. La suite de interfaz web pasó 95 pruebas. Durante la revisión se actualizaron dos fixtures antiguas para que cubran las lecturas actuales de captura y se sincronizó una prueba de concesión para eliminar una carrera de temporización. Estas pruebas no sustituyen la revisión en navegador ni la validación en Cloudflare y proveedores reales.

La repetición completa de la API pasó 156 pruebas con concurrencia limitada después de corregir la fixture de captura de conocimiento. La prueba de borrado también confirmó la reversión transaccional ante un fallo de base de datos. Los resultados corresponden a Miniflare y no demuestran el despliegue ni los límites reales de Cloudflare.

### Modo alojado deshabilitado

Una prueba en Miniflare cambia una fila de runner a modo alojado durante una concesión y comprueba que no pueda renovar, completar, consultar credenciales ni usar una ruta de captura; al volverla local, la concesión puede renovarse. El cambio de modo se hace únicamente en la base de pruebas: no existe una ruta pública que habilite ese modo. El aviso web cuenta solo runners locales al decidir si hay actividad reciente; un registro alojado o un modo desconocido no ocultan la indicación de conectar una máquina. Esto no implementa ni activa ejecución alojada.
