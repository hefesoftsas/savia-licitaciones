# Savia web con runner local: diseño inicial

## Objetivo

Llevar todas las funciones actuales de Savia a una aplicación web, con proyectos y documentos en la nube y ejecución de tareas mediante un runner instalado en el equipo del cliente. Conservar Pi como motor de agentes. Este documento recoge las decisiones de producto y delimita el trabajo; los contratos técnicos y el calendario se definirán por etapas.

## Decisiones

- Usar Better Auth para la autenticación de usuarios y Miniflare para emular localmente Cloudflare durante desarrollo y pruebas.
- Desplegar la aplicación web y los servicios de coordinación en Cloudflare. Los datos estructurados y documentos tienen su fuente de verdad en la nube. La selección concreta de servicios y el plan de migración requieren evaluación y pruebas.
- El runner local mantiene una conexión saliente autenticada, recibe trabajos autorizados y ejecuta las tareas con Pi. Las tareas siguen funcionando si se cierra el navegador; cuando el runner no esté disponible, se informa al usuario y se espera su reconexión.
- Diseñar un contrato que pueda admitir posteriormente un runner alojado. No activarlo, desplegarlo ni ejecutar tareas en él durante esta iniciativa sin una decisión posterior expresa. No existe conmutación automática a recursos de pago.
- Cada cliente conecta sus propios proveedores. El objetivo es cubrir los proveedores y métodos de autenticación admitidos por la versión de Pi integrada, sujetos a compatibilidad real y a sus condiciones. Revisar los flujos OAuth y el uso de suscripciones en aplicaciones de terceros antes de ofrecerlos. La política vigente del repositorio y la política global de proveedores deben conciliarse antes de implementar cualquier proveedor adicional. No habilitar Workers AI, AI Search ni las capacidades de inferencia prohibidas en la configuración global.
- Guardar las credenciales cifradas en la nube, asociadas al cliente; definir aislamiento, gestión y rotación de claves, acceso limitado por runner, revocación y tratamiento seguro en logs antes de implementarlo.
- Mantener las características actuales, sus flujos, persistencia, importación y exportación, tareas prolongadas, controles e idiomas. Inventariar las capacidades vinculadas a Electron y documentar sus equivalentes web; donde una capacidad de escritorio no tenga equivalente directo, diseñar una alternativa y confirmar cualquier cambio funcional significativo.
- La versión Contributor puede permitir el uso de entradas y salidas para entrenamiento. Informar y obtener las autorizaciones pertinentes antes de enviar contenido; no asumir que todos los proveedores tienen las mismas condiciones.

## Alternativas consideradas

La opción preferida centraliza archivos y estado estructurado en la nube, con runners como ejecutores. Otra opción sería sincronizar una base SQLite por cliente; se descarta como propuesta inicial por la complejidad de conflictos y escritura concurrente. La elección de tecnologías de datos concretas queda para pruebas de viabilidad y costos.

## Épicas de implementación y dependencias

1. Inventariar funcionalidades, IPC, archivos, SQLite, herramientas nativas, configuraciones y tareas, incluyendo cambios pendientes aún no integrados en la base.
2. Definir arquitectura multiusuario, autenticación, aislamiento, modelo de datos y migración desde el espacio local, con pruebas de restauración.
3. Implementar servicios y almacenamiento en la nube, contratos de archivos y transporte web para sustituir el puente de Electron.
4. Construir runner local instalable para plataformas admitidas: emparejamiento, identidad revocable, conexión saliente, reconexión, tareas durables, cancelación y progreso.
5. Integrar Pi y proveedores por cliente, credenciales, capacidades de modelos, límites y condiciones de uso. Evitar fallback silencioso.
6. Migrar y probar cada función de Savia, importación, exportación y dependencias nativas, preservando semántica y contenido.
7. Implementar observabilidad sin contenido sensible, medición de consumo, recuperación, límites y verificaciones de aislamiento. Estimar costo real antes de producción.
8. Preparar interfaz del contrato para ejecución alojada sin aprovisionar ni habilitar esa modalidad.

## Criterios de aceptación

- Paridad demostrada por inventario y pruebas funcionales de todas las funciones actuales aplicables; excepciones explícitamente acordadas.
- Un cliente puede abrir sus proyectos desde el navegador y ejecutar una tarea completa en su propio runner; el progreso se recupera tras recargar o reconectar.
- Proyectos, archivos y credenciales de distintos clientes están aislados y las credenciales no aparecen en logs.
- La ausencia del runner local no inicia cómputo alojado ni causa cargos por ese concepto.
- Los proveedores expuestos están probados para la función y el método de autenticación elegido; fallos y límites se muestran sin cambio de proveedor silencioso.
- Los datos existentes se migran con verificación de integridad y posibilidad de recuperación.
- No hay despliegue de producción ni activación de runners alojados como parte de este diseño.

## Pendientes para diseño detallado

Definir alcance exacto del inventario y funcionalidad de escritorio que debe preservarse; servicios y región Cloudflare, costos, acceso multiusuario, cifrado y recuperación, modo de distribución y actualización del runner, protocolo durable, cambios de esquema, compatibilidad de modelos y estrategia de migración. Evaluar políticas y términos aplicables sin asumir que una suscripción personal autoriza su uso en el producto.

## Condiciones para los diseños detallados

- Especificar concesión y caducidad de trabajos, prevención de ejecuciones duplicadas, reintentos idempotentes y recuperación de sesiones y preguntas pendientes tras desconexión o reinicio.
- Definir el vínculo y revocación de cada runner, junto con el aislamiento entre clientes de credenciales, archivos temporales y herramientas ejecutadas por Pi.
- Preservar el esquema efectivo, los identificadores de nodos, la semántica de `saveOutline`, los estados y las sesiones persistentes al migrar datos.
- Verificar las dependencias nativas y la paridad de importación y exportación en los sistemas soportados, incluidos Windows y macOS.
- Adaptar el proxy y `aiService` a cada método de proveedor compatible: mostrar el catálogo de Pi por sí solo no proporciona la integración completa.
