# Formatos de documentos en consultas web

El selector web permite DOC, WPS, XLS y XLSX pero el extractor para consultas y planes solo acepta texto, PDF y DOCX. Reutilizar el parser local del escritorio para esos formatos; no recurrir a OCR ni a servicios externos. Admitir MIME genérico cuando la extensión y, para los formatos con firma conocida, el contenido sean compatibles; conservar el rechazo de archivos binarios que se presentan como texto o como otro formato. DOC y WPS pueden requerir LibreOffice o un conversor compatible instalado en el runner y deben presentar un error útil si falla la conversión.

Probar extracción real de XLS y XLSX, MIME genérico, formatos contradictorios, cancelación, manejo de DOC/WPS con parser simulado, y la transferencia real por Miniflare y el paquete de runner. No afirmar que se ha probado un conversor Word real o Windows sin hacerlo.

La extracción de XLS y XLSX usa el parser real, y el recorrido XLSX pasó por R2/D1 en Miniflare y Pi con respuestas simuladas. Una conversión DOC real pasó con LibreOffice en macOS arm64. El tratamiento de WPS se comprobó con un parser simulado; aún requiere una muestra real y verificación en Windows y macOS x64.
