# Seguimiento de planes anuales de adquisiciones

**Objetivo:** Seguir un plan PAA y avisar cuando cambia su versión publicada, sin afirmar que una línea de adquisición concreta sea la misma entre versiones.

**Evidencia:** En 9sue-ezhx, `identificador_unico` puede repetirse en miles de filas: el encabezado CO1.APP.1389912 aparece en 4.169 filas distintas. El campo `id` identifica la fila de detalle. `id_plan_anual_de_adquisiciones` enlaza con el [conjunto de encabezados b6m4-qgqv](https://www.datos.gov.co/Gastos-Gubernamentales/SECOP-II-PAA-Encabezado/b6m4-qgqv). Colombia Compra documenta que el PAA tiene versiones publicadas y puede modificarse. La vigilancia compara el encabezado completo, no intenta enlazar líneas individuales entre versiones.

- [x] Corregir la identidad y el enlace de cada fila en la búsqueda de detalle.
- [x] Consultar el encabezado por su identificador, sin usar caché en revisiones, y conservar errores y ausencia de información sin inventar cambios.
- [x] Guardar planes seguidos, línea base y avisos en SQLite; verificar cada seis horas mientras la app está abierta y a demanda, con migración y pruebas.
- [x] Integrar seguimiento, revisión de avisos y eliminación en la interfaz y el contador lateral; informar que los detalles planeados pueden cambiar y enlazar al registro oficial.
- [x] Verificar con respuestas sintéticas, consulta pública, migración, Electron y presentación es/en.

La prueba pública encontró el encabezado del ICA con la versión 13; las pruebas automatizadas cubren cambios simulados, errores, persistencia, revisión y consulta sin caché. Los avisos requieren Savia abierta y conexión a datos.gov.co; no identifican qué adquisición cambió ni sustituyen la verificación en SECOP.

Las consultas pendientes se invalidan al dejar de seguir un plan. Se probaron la eliminación y el nuevo seguimiento durante una consulta anterior, errores tardíos y un plan que cambia mientras espera en la cola de revisión, evitando que una respuesta vieja sobrescriba la nueva línea base o genere avisos falsos.

Una consulta real por entidad BOGOTA y año 2025 agotó el tiempo de espera al ordenar por año, fecha de versión e ID. La misma consulta sin ese orden respondió en 1,2 s; con el identificador interno descendente de Socrata respondió en 2,4 s y mantiene un criterio único para paginar. La aplicación usa ahora ese orden e informa que no es cronológico: no garantiza mostrar primero las versiones más recientes y los cambios de la fuente pueden alterar las páginas. Con el servicio corregido, dos páginas reales respondieron en macOS y Windows; una consulta adicional verificó que sus 40 identificadores internos no se repetían. Las pruebas de interfaz verifican el aviso en español e inglés. Los tiempos son observaciones puntuales, no garantías de disponibilidad.

En la misma búsqueda real, el primer detalle identificó el plan `MarketplaceCO1609609` de la Orquesta Filarmónica de Bogotá y la versión 17. Una consulta posterior del encabezado devolvió la misma entidad y versión. Esto comprueba el enlace para esa muestra; no demuestra que todas las filas ni todas las versiones del conjunto estén completas.
