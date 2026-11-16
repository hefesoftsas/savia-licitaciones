# Comparación SECOP y plan de evolución de Savia

Fecha de investigación: 30 de octubre de 2026. Las capacidades son declaraciones públicas de los proveedores, no una verificación de sus productos; disponibilidad y precios pueden cambiar.

## Comparación

| Alternativa | Capacidades anunciadas | Qué aporta a Savia |
| --- | --- | --- |
| [LicitIA](https://licitia.com.co/) | Radar, etapas Kanban, bóveda, evaluación de RUP y propuestas; Starter sin IA y planes superiores con límites. | Seguimiento, requisitos vinculados a soportes y documentos reutilizables; evaluar simulación económica solo con fórmula verificable. |
| [ProcesoSECOP](https://procesosecop.com/planes?aviso=alertas) | Búsqueda por filtros, ficha y cronograma; en planes pagos, visor, seguimiento de cierre, fase, valor y adendas. IA en pruebas. | Comparar cambios de información publicada y conservar el último estado consultado, indicando su fecha y cobertura. |
| [Portal Wheeler](https://licitacioneswheeler.com/soporte) | Búsqueda, seguimiento y resúmenes diarios por correo de nuevos procesos y cambios de estado. | Búsquedas guardadas y avisos locales; no prometer correo ni monitoreo continuo con la aplicación cerrada. |
| [dclic](https://licitaciones.dclic.co/nosotros) | Alertas por región, sector, palabras y cuantía; resumen y cruce con RUP en planes pagos. | Perfiles de búsqueda reutilizables y filtros orientados a lo que vende la empresa; contrastes con soportes comprobables. |
| [Licitarus](https://www.licitarus.com/ayuda/vigilar-un-proceso) | Tablero por etapas, calendario, tareas, seguimiento de adendas y comparación entre fases. | Etapas, tareas y fechas por proyecto; cambios entre consultas y citas verificables, sin confundir estado oficial y trabajo propio. |
| [Templo](https://www.temploapp.co/) | Fuentes con página citada, ajuste de requisitos al perfil, documentos con vigencias y seguimiento de adendas. Su sitio presenta propuesta y tablero de equipo como próximos. | Citas vinculadas al original cuando se disponga de página real; vigencias y matriz de cumplimiento con evidencia y estado desconocido. |
| [LIDECOL](https://www.lidecol.com/) | Filtros, datos históricos por entidad, análisis de competencia y auditoría documental. | Explorar comparaciones con datos públicos verificables; no inferir ganadores o precios sin fuentes y cobertura. |
| [Soberano AI](https://www.soberanoai.com/) | Cruce de requisitos financieros y experiencia con RUP, soporte documental vinculado al numeral y preparación de propuesta. | Matriz de requisitos y soportes, con revisión humana y citas; evitar veredictos automáticos definitivos. |

## Estado de Savia

Ya existen búsqueda SECOP I/II con filtros y exportación, licitaciones guardadas con actualización manual de datos publicados, proyectos aislados, análisis por apartados, chat con selección de documentos, vista previa y carga de archivos, generación y exportación de propuestas, y biblioteca de credenciales con datos de vigencia. Estos flujos deben reutilizarse y preservarse.

## Prioridades

1. **Seguimiento local:** etapa propia por licitación y filtro; independiente del estado oficial. Base para una vista de tablero posterior. Estado: implementado y verificado.
2. **Tareas y fechas:** lista de acciones y vencimientos asociados al proyecto, con información oficial y fechas introducidas por el usuario claramente diferenciadas. Avisos locales solo mientras la aplicación pueda atenderlos; no prometer vigilancia 24/7. Estado: tareas y fechas personales implementadas; avisos pendientes.
3. **Requisitos con evidencia:** checklist editable con fuente, documento y estado pendiente/cumple/no cumple/no determinado; no emitir una decisión de elegibilidad sin revisión ni inventar páginas. Estado: implementado con valoración manual.
4. **Cambios entre consultas:** comparación explícita del estado, cierre y datos públicos disponibles; no afirmar que se verificaron adendas sin contar con una fuente autorizada y completa. Estado: implementado para consultas manuales.
5. **Vigencias de credenciales:** avisos usando la biblioteca existente y fechas reales; no duplicar registros ni documentos. Estado: implementado para fechas vencidas o próximas a vencer.
6. **Investigación posterior:** comparación de procesos, filtros guardados y análisis de adjudicaciones; revisar cobertura y calidad de datos antes de mostrar métricas.

Alertas por correo, mensajería, integraciones externas, vigilancia en segundo plano y sincronización colaborativa requieren un diseño y autorización específicos; las conexiones en producción están limitadas por las reglas del proyecto. El objetivo no exige GPU ni nuevos proveedores de modelos. No añadir RAG ni inferencia a la primera mejora.

## Primera entrega: etapas de seguimiento

**Objetivo:** permitir organizar las licitaciones guardadas por etapa de trabajo sin alterar el estado publicado, los proyectos o análisis.

**Enfoque:** guardar la etapa por ID en SQLite global de la biblioteca, separada de las instantáneas de proyecto. Etapas: `evaluating`, `preparing`, `submitted`, `awarded`, `not_awarded`, `discarded`. Los registros existentes se presentan como `evaluating` sin modificar datos; el usuario puede cambiar cualquier etapa. La actualización o sincronización de SECOP no debe sobreescribirla. Una licitación eliminada elimina su etapa. Filtro de etapas y selector accesible en «Mis licitaciones» en español e inglés.

**Alternativas:** guardar el estado en la copia de proyecto haría inaccesible el tablero global y complicaría cambios entre proyectos; introducir una plataforma o servicio remoto contradice el funcionamiento local. La biblioteca SQLite existente permite gestionarlo sin nueva infraestructura.

**Archivos:** `client/electron/services/sqliteDatabase.cjs`, `sql/workspace_schema.sql`, `client/electron/services/secopLibrary.cjs`, su test, `client/electron/ipc/index.cjs`, `client/electron/preload.cjs`, `client/src/shared/types/{ipc,secop}.ts`, `client/src/features/secop/pages/SecopLibraryPage.tsx` y estilos existentes de SECOP.

**Verificación:** pruebas de etapas por ID, valor inicial, persistencia tras reapertura, aislamiento entre licitaciones, sincronización y eliminación; prueba de interfaz sobre filtro y cambio sin tocar el estado oficial; `node --check`, pruebas focalizadas, `npm run smoke:electron-native` y `npm run build`. Comprobar temas y tamaño de ventana sin muestras ficticias en el producto.

## Segunda entrega: tareas y fechas personales

**Objetivo:** registrar los pasos que una persona debe completar para cada licitación, con fecha opcional y estado pendiente o completado. No generar fechas ni recordatorios automáticamente.

**Diseño:** tabla SQLite global `secop_tender_tasks`, aislada por ID de proceso como la etapa. Una tarea contiene ID UUID, proceso, descripción, fecha opcional, estado y fechas de creación y actualización. Borrarla no afecta otras tareas; eliminar la licitación elimina solo sus tareas. La fecha es introducida por la persona y no reemplaza la fecha publicada por SECOP. La pantalla de detalle muestra tareas y un formulario pequeño; entrada vacía no se guarda, y el calendario y las notificaciones automáticas quedan para una entrega posterior.

**Interfaces:** `secopLibrary.listWorkTasks(id)`, `addWorkTask(id, {title, dueDate})`, `setWorkTaskCompleted(id, taskId, completed)`, `removeWorkTask(id, taskId)`; IPC/preload correspondientes. La vista solicita las tareas del proceso seleccionado, ignora respuestas anteriores al cambiar de selección y muestra errores de guardado.

**Verificación:** pruebas de CRUD, aislamiento, reapertura, eliminación de proyecto, fecha vacía y fechas propias frente al dato oficial; prueba real de interfaz con creación, completar, cambio de licitación y regreso. Ejecutar migración de v44 a v45, pruebas existentes, native smoke y build.

## Tercera entrega: comparar información oficial al actualizar

**Objetivo:** al pulsar «Actualizar estado en SECOP», comparar la copia guardada con la respuesta recibida y mostrar cambios de estado, fase, cierre y valor en el detalle, con valores anterior y nuevo. Los datos ausentes se muestran como no informados y la comparación solo se presenta cuando una lectura termina correctamente. Si no cambia ninguno, indicar que no se detectaron cambios en esos campos. La consulta y actualización siguen siendo manuales; esto no verifica adendas ni historial completo.

**Diseño:** comparación pura de campos publicados basada en la copia anterior y la respuesta normalizada, sin otra llamada ni inferencia. La comparación es temporal para esa consulta, desaparece al abrir otra licitación y no modifica su etapa ni tareas personales. No se inventan diferencias por la actualización de los demás campos.

**Verificación:** pruebas puras con cambios, ausencia, ceros y fechas; prueba de UI con SECOP simulado que confirme valores anterior/nuevo y etapa intacta, sin llamadas externas.

## Cuarta entrega: fechas de credenciales

**Objetivo:** señalar en la biblioteca de credenciales los certificados y documentos de identidad de personal cuya fecha de fin registrada ya pasó o está a 30 días o menos. La indicación solo usa la fecha guardada: no certifica validez jurídica ni interpreta vigencias que no se hayan escrito.

**Diseño:** cálculo local por días calendario, con el día actual incluido, sin depender de servicios ni crear copias de registros. Valores «permanente», sin fecha o fechas inválidas no producen una alerta inventada. Mostrar texto claro junto al dato existente de cada registro en español e inglés.

**Verificación:** prueba de 30/31 días, vencido, hoy, años bisiestos, cambio de mes, fecha inválida y vigencia indefinida; comprobación de interfaz y build.

## Quinta entrega: matriz manual de requisitos y evidencias

**Objetivo:** permitir documentar cada requisito de una licitación, su fuente y el soporte disponible, con una valoración elegida por la persona. No generar requisitos, citas ni veredictos automáticos.

**Diseño:** tabla SQLite global `secop_tender_requirements`, aislada por ID de proceso. Cada registro tiene descripción, referencia de fuente, soporte, valoración (`pending`, `meets`, `does_not_meet`, `unknown`) y fechas. El usuario agrega, edita y elimina cada registro; los campos de fuente y soporte son texto aportado por la persona, no enlaces inventados. El panel explica que la valoración es manual y requiere revisión. La eliminación de una licitación elimina solo sus requisitos.

**Verificación:** pruebas de creación, edición, aislamiento, persistencia, eliminación, entrada vacía y conservación tras actualización SECOP; test real de interfaz con licitaciones independientes, cambio de estado y reapertura.
