# Captura de los proyectos de una cuenta

El runner necesita descubrir todos los proyectos de su propia cuenta para capturarlos sin pedir sus identificadores uno por uno. Un endpoint autenticado devuelve páginas por ID, limitadas y ordenadas. El runner recorre el inventario, captura cada proyecto mediante el transporte existente y vuelve a recorrerlo antes de publicar un índice; si detecta un cambio o falla una captura, conserva las capturas terminadas sin índice final. La detección de cambios no hace atómica la captura y no identifica un cambio intermedio revertido. El conjunto y cada proyecto siguen siendo parciales, sin cifrado ni credenciales.

1. Probar en Miniflare autenticación, paginación, orden, aislamiento, límites y revocación del inventario; implementar el endpoint sin alterar servicios alojados.
2. Probar el coordinador con páginas, cambio de inventario, error parcial y rutas seguras; reutilizar la captura individual y publicar un índice exclusivo solo al finalizar.
3. Integrar el comando y la distribución, verificar el recorrido real y documentar que la recuperación coordinada de proyectos queda pendiente y que no es una copia completa.

**Estado:** el inventario autenticado pagina por cuenta e ID con un índice D1 específico. `capture-account-projects` captura hasta 10.000 proyectos, conserva los terminados ante fallos y solo publica el índice si la lista final coincide. Miniflare y el runner empaquetado en macOS verificaron paginación, aislamiento, un objeto R2, cambios durante la captura y revocación. Los proyectos se recuperan individualmente; falta coordinación de recuperación y validación del paquete en Windows y Linux. No hay captura atómica ni respaldo completo.

**Actualización:** el conjunto terminado ya puede recuperarse de forma coordinada con `restore-account-projects`; sus verificaciones y límites se describen en `2026-11-02-restaurar-proyectos-cuenta.md`.
