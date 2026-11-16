# Seguimiento personal de oportunidades

El checkout original conserva por licitación una decisión (`review`, `participate` o `discarded`), una persona responsable y notas en `secop_opportunity_tracking`. La decisión es personal y distinta del estado publicado en SECOP. El servicio de escritorio usa como clave el identificador real de la licitación guardada; permite hasta 120 caracteres en responsable y 4.000 en notas desde su interfaz.

La web debe permitir consultar y editar esos campos por proyecto, incluyendo proyectos de licitaciones locales y SECOP, en español e inglés. Guardar en D1 por propietario y proyecto, con versión para evitar que una pestaña sobrescriba silenciosamente otra. La ausencia de registro se muestra como `review` y campos vacíos. Eliminar un proyecto elimina su seguimiento; la API no permite que otra cuenta lo lea ni lo modifique.

La importación debe leer la tabla solo cuando exista en el respaldo y asociarla por el `process_id` exacto de la licitación, tanto para planes vinculados como para licitaciones guardadas independientes. No deducir asociaciones ambiguas. Transferirla mediante una operación y recibo independientes de las importaciones existentes: un reintento idéntico no revierte ediciones posteriores, un seguimiento web preexistente produce conflicto y un proyecto eliminado no se recrea. Informar explícitamente los conflictos y registros que no puedan asociarse. Los respaldos anteriores sin la tabla siguen siendo válidos.

1. Probar primero lectura de respaldos antiguos y nuevos, asociaciones exactas, seguimiento ausente y registros huérfanos.
2. Implementar migración D1, consulta y edición con aislamiento, control de versión y eliminación; probar concurrencia y límites.
3. Implementar importación idempotente por runner para ambos caminos, con conflictos, reintentos y aislamiento cubiertos en Miniflare.
4. Añadir la edición a la vista de proyecto y probar sus estados e idiomas; verificar runner empaquetado, compilación y que la copia y restauración del proyecto incluya el seguimiento.

No despliega servicios ni activa ejecución alojada. La revisión visual interactiva depende de disponer de navegador habilitado.

**Avance:** el lector de respaldos recupera decisión, responsable y notas para el `process_id` explícito del contexto y para licitaciones guardadas, y cuenta registros sin licitación. Una prueba cubre respaldos sin tabla, datos de un plan y una licitación independiente, huérfanos y una coincidencia de ID de plan sin vínculo explícito. Aún faltan la interfaz, el almacenamiento, la transferencia y su recuperación; el lector por sí solo no migra datos.

El servicio de consulta y edición está conectado a la API y a una migración D1. Las pruebas con SQLite y Miniflare cubren aislamiento, origen, límites, concurrencia y eliminación en cascada. La suite anterior completa de la API terminó con 126 pruebas aprobadas antes de incorporar esta migración; después pasaron las pruebas focalizadas de la función y del inventario de tablas.

La vista de seguimiento está montada en el seguimiento del trabajo con estados de carga y error, protección de cambios sin guardar y aviso ante un conflicto de versión; su representación en español e inglés y las compilaciones web y del cliente pasan. La inspección visual en navegador sigue pendiente.

**Migración:** el runner transfiere el seguimiento en planes vinculados y licitaciones independientes mediante un recibo separado. La API conserva ediciones posteriores al reintentar, señala conflictos y no recrea proyectos eliminados. Las pruebas con Miniflare y un respaldo SQLite cubren ambos caminos y reintentos concurrentes. Los registros sin licitación se cuentan en el resultado de importación de licitaciones guardadas.

**Captura web:** la captura parcial incluye el seguimiento y su revisión cambia cuando se edita. El runner lo valida antes de crear el proyecto y lo restaura mediante el recibo idempotente; una repetición no revierte ediciones posteriores. Las pruebas cubren captura y restauración con Miniflare, aislamiento y compatibilidad de las capturas anteriores. Se trata de una captura parcial de proyecto, no de una copia completa de la cuenta.

**Runner empaquetado:** en macOS ARM64 se construyó una distribución independiente sin descargas y se ejecutaron contra Miniflare las pruebas de importación de respaldos de escritorio y captura/restauración de proyectos web usando su CLI y sus módulos. Ambas pasaron; la carpeta temporal se eliminó. Estas pruebas no sustituyen la verificación en Windows ni Linux.

**Pendiente:** completar la revisión visual cuando haya navegador disponible y verificar el recorrido empaquetado en las demás plataformas soportadas.
