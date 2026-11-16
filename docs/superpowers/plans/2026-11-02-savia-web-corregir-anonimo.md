# Corrección de oferta anónima

**Objetivo:** permitir crear y descargar una copia DOCX corregida con las reglas elegidas, preservando el documento original y el perfil de inspección.

**Diseño:** reutilizar el helper de escritorio para corregir, validar y volver a inspeccionar en el runner. Adaptar a Node la conversión de imágenes a gris. Una tarea separada debe referirse a una inspección privada válida, usar su perfil y fuentes originales, y guardar la copia con su informe de validación; no modificar el archivo original. La reparación asistida por Pi requiere continuidad de sesión y queda pendiente de una implementación separada.

1. Probar el helper real con DOCX y verificar que el original no cambia, la copia pasa la validación y se limpian temporales.
2. Adaptar reglas e imágenes al runner, con cancelación y errores explícitos.
3. Conectar la cola, el almacenamiento y la selección de reglas, con pruebas de aislamiento, reintentos y cancelación.
4. Verificar con el runner empaquetado, compilar y revisar las limitaciones de plataformas y de la interfaz.

**Verificación:** el helper real corrigió propiedades y convirtió imágenes en DOCX de prueba; los originales no cambiaron y la copia se validó y revisó de nuevo. Miniflare cubrió aislamiento, descarga, cancelación y vínculo con la inspección; el recorrido pasó también con el CLI y el módulo empaquetados en macOS ARM. Compilaron escritorio y web. Quedan pendientes la revisión visual interactiva, otras plataformas y la reparación asistida por Pi.
