# Importación de comparaciones RUP históricas

**Objetivo:** trasladar las comparaciones y sus fuentes históricas de escritorio al proyecto web sin presentar datos antiguos como una valoración vigente.

**Diseño:** tras importar el seguimiento, el runner transfiere cada instantánea del proceso y, si existe, una copia del PDF que la sustentaba. Una tabla separada conserva los campos originales y una referencia al requisito web solo si existe el mapa de identidad. Las fuentes ausentes se indican; no impiden conservar el texto. El PDF se entrega solo al propietario como descarga. Las importaciones son idempotentes por respaldo y requisito de origen, usan staging para archivos y no reemplazan comparaciones web editadas. La interfaz muestra explícitamente que son históricos y requieren revisión; los requisitos sin correspondencia permanecen visibles en el proyecto.

1. Pruebas Miniflare con PDF presente y ausente, aislamiento, idempotencia, conflictos y limpieza ante fallo; prueba del runner desde un respaldo real.
2. Implementar almacenamiento separado, rutas de lectura y descarga, y transferencia del runner.
3. Presentar los históricos en el seguimiento con fecha y fuente; ejecutar pruebas, builds y distribución. La aplicación explícita a una comparación vigente seguirá requiriendo revisión humana.

**Estado:** transferencia, descarga y consulta de instantáneas históricas implementadas. El vínculo se resuelve únicamente mediante mapas disponibles; las importaciones antiguas sin mapa y los requisitos eliminados aparecen sin vínculo. Las comparaciones actuales se editan por el flujo habitual tras revisión de sus fuentes.
