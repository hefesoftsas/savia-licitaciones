# Exportación Word del plan técnico mediante runner

La exportación debe reutilizar el ensamblador y OpenXML del escritorio; se conecta por etapas sin ofrecer una descarga incompleta.

1. Adaptar el ensamblador de `technicalPlanExport.cjs` a un proceso Node sin Electron, usando un espacio temporal aislado, el formato predeterminado existente y el helper OpenXML real. Verificar un DOCX legible con capítulos y texto, errores y limpieza; conservar avisos del ensamblador.
2. Empaquetar el helper para el sistema del runner y verificarlo sin depender del SDK en la máquina del usuario.
3. Agregar trabajos versionados con instantánea autorizada, almacenamiento y descarga binaria idempotente; conectar la pantalla solo después de verificar cancelaciones, recuperación y aislamiento entre usuarios.
4. Incorporar plantillas seleccionables e imágenes con las mismas reglas del escritorio, y comprobar cada plataforma admitida. No desplegar ni activar runner alojado.

## Protocolo de archivo (fase 3)

- `technical-plan.export-word` lleva `planVersion` y `language` sin credenciales. El contexto de runner exige concesión activa y versión vigente, y devuelve árbol completo numerado.
- `POST /api/runner/jobs/:id/artifact` recibe DOCX binario y concesión en `X-Savia-Lease`, hasta 25 MiB. R2 usa claves únicas por intento; D1 registra un único resultado por tarea mediante inserción condicional a la concesión. Repetir los mismos bytes es idempotente y bytes distintos producen conflicto. Un intento sin registro elimina su objeto.
- La finalización exitosa solo acepta el identificador guardado. El propietario descarga el archivo de un trabajo finalizado desde su proyecto; otros usuarios y trabajos pendientes no lo ven. No se incluyen credenciales ni documentos en el JSON de resultados.
- Verificar caducidad/cancelación, concurrencia, repetición, aislamiento, cambio de versión, formato y limpieza antes de conectar la interfaz. Las interrupciones conservan la semántica existente; se documenta la posible limpieza posterior de objetos huérfanos por caída entre R2 y D1.

Las imágenes de la biblioteca de la cuenta pueden referenciarse desde los capítulos y se entregan al runner por la concesión de exportación. Miniflare probó aislamiento y una exportación real verificó la imagen en el Word, también con el runner empaquetado en macOS ARM. Quedan pendientes revisión visual y pruebas en otras plataformas.

La vista previa del capítulo también presenta las imágenes disponibles de la biblioteca y sigue bloqueando referencias externas o ajenas. Si falla una de las dos cargas, conserva las imágenes obtenidas de la otra y ofrece reintentar.
