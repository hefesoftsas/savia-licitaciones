# Soportes de requisitos en la web

El escritorio conserva documentos requeridos por licitación y requisito: título, estado declarado (`missing`, `pending`, `reviewed`) y vínculo opcional a una credencial o al RUP. El vínculo no acredita cumplimiento. La web necesita crear, revisar, vincular y retirar esos documentos; mostrar los vínculos retirados o no disponibles sin afirmar que el documento existe.

El identificador del requisito de escritorio se remapea al importar el flujo. Los certificados de escritorio se remapean por sus recibos de importación, asociados al mismo respaldo; un RUP usa `rup:<stored_name>` y solo puede vincularse cuando se demuestre que corresponde al documento importado. Sin prueba suficiente, conservar el vínculo histórico como no disponible y ofrecer selección manual. No deducir equivalencias por nombre. Al importar, no sobrescribir ediciones web ni recrear elementos retirados; los reintentos idénticos deben ser idempotentes y los conflictos visibles.

1. Probar y leer soportes solo por el `process_id` real y el requisito correspondiente; aceptar respaldos antiguos sin tabla y contar referencias huérfanas. Preservar el identificador del documento sin publicarlo en diagnósticos.
2. Añadir almacenamiento y API aislados por propietario y proyecto, con estados, vínculo opcional, concurrencia y eliminación en cascada. Verificar que las credenciales seleccionadas pertenecen a la cuenta y que un RUP corresponde al actual.
3. Añadir transferencia independiente, remapeo explícito de requisitos y certificados, recibos y pruebas de conflictos, eliminaciones, importación de certificados posterior y dos cuentas.
4. Incorporar la interfaz es/en en el requisito, con estados y vínculo no disponible. Añadir el contenido a captura y restauración parcial del proyecto, incluyendo compatibilidad con capturas anteriores, y verificar runner empaquetado.

No desplegar servicios ni activar runner alojado. La revisión visual requiere navegador habilitado.

**Avance:** el lector del runner recupera los soportes de los requisitos de la licitación vinculada y de las licitaciones guardadas, y cuenta los que no tienen requisito correspondiente. Acepta respaldos sin la tabla y conserva los identificadores originales para su posterior remapeo. Pasaron 30 pruebas de lectura y regresión de respaldos. Todavía no hay transferencia ni interfaz para estos soportes.

La API ya permite crear, listar, actualizar y retirar soportes por requisito, con aislamiento por cuenta, control de versión y borrado en cascada. Comprueba que los certificados pertenecen al usuario y que el RUP vinculado es el actual; al retirarse o reemplazarse el documento, la consulta conserva el vínculo y lo marca no disponible. Las pruebas Miniflare y de regresión del flujo pasan.

La vista del requisito permite crear, revisar, vincular y retirar soportes en español e inglés. Marca documentos no disponibles, advierte que un vínculo no prueba cumplimiento y protege el nombre sin guardar al navegar. La representación estática, el detector de diseño y las compilaciones web y del cliente pasan; faltan pruebas interactivas y revisión visual.

La captura parcial web incluye los soportes y detecta cambios durante la captura. La restauración remapea cada requisito, preserva título y estado y conserva el tipo e identificador del vínculo como no resuelto, sin asumir que el documento pertenezca a la cuenta destino. Las pruebas verifican aislamiento, compatibilidad con capturas anteriores y que los reintentos no reviertan ediciones ni recreen soportes retirados.

La importación de respaldos de escritorio transfiere los soportes después de los requisitos, tanto para planes vinculados como licitaciones independientes; devuelve conflictos y conteo de soportes huérfanos. Para certificados y RUP, usa el recibo de la misma cuenta, el hash del respaldo y una huella del identificador original; el RUP además debe seguir siendo el actual. Si los documentos se importan después, repetir el comando resuelve vínculos que siguen sin modificar. No restaura vínculos retirados ni sobrescribe ediciones. Las pruebas de Miniflare cubren los recibos, fuentes distintas, reemplazo de RUP, reintentos y aislamiento; el comando real de importación de RUP se comprobó con un PDF de prueba. Las importaciones anteriores a la existencia de los mapas o del identificador de RUP conservan sus vínculos no resueltos y requieren selección manual.

La importación de soportes, el remapeo de certificados y RUP y la captura/restauración web pasaron con una distribución independiente del runner en macOS ARM64 y Miniflare. Se eliminó la copia temporal. Aún faltan pruebas empaquetadas en Windows y Linux y la revisión visual interactiva.
