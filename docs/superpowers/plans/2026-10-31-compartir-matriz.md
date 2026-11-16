# Compartir una matriz de requisitos

La colaboración en tiempo real requiere infraestructura e identidad compartidas. Como primer intercambio local, Savia permitirá exportar una copia CSV de los requisitos guardados de una licitación: categoría, valoración humana, fuente, soporte y comparación RUP guardada, incluida su vigencia. El archivo incluirá los datos de identificación de la licitación y la fecha de exportación.

La persona elige dónde guardar el archivo y puede compartirlo por el canal que prefiera. El CSV es una instantánea: no sincroniza cambios ni incluye documentos originales. Solo se exportan cambios guardados; la pantalla lo indicará. No se inventan páginas ni se deduce cumplimiento a partir de los valores del RUP. La exportación debe conservar texto Unicode, neutralizar fórmulas de hojas de cálculo y rechazar una licitación eliminada antes de guardar.

- [x] Probar y generar el CSV con datos de ejemplo, comparaciones vigentes y desactualizadas, celdas vacías, saltos de línea y texto que empiece por fórmulas.
- [x] Conectar un diálogo de guardado y exportar solo datos de la empresa y licitación seleccionadas.
- [x] Integrar el botón y la explicación en español e inglés, verificando la exportación real y el diseño en Electron.

La prueba Electron exportó una comparación RUP desactualizada, comprobó que se excluyeran los requisitos de otra licitación y los cambios no guardados y revisó el diseño en una ventana estrecha. Las pruebas del servicio cubren cancelación, eliminación de la licitación durante el diálogo y texto de hoja de cálculo potencialmente interpretado como fórmula.

También se puede exportar como XLSX usando la biblioteca ya incluida en Savia. El libro conserva textos literales y un filtro por columnas, sin depender del separador regional de CSV. Se reabrió independientemente para verificar celdas, saltos de línea y estado de vigencia; el CSV se abrió en LibreOffice Calc. Ambos siguen siendo copias locales sin sincronización.
