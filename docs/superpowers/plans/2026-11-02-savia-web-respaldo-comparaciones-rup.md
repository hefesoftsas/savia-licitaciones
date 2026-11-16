# Captura de comparaciones históricas RUP

**Objetivo:** conservar comparaciones RUP históricas de cada proyecto, sus vínculos a requisitos y las fuentes PDF incluidas en la recuperación parcial.

**Diseño:** la revisión de captura incluye filas y ETags, identifica los requisitos que aún existen y transporta cada PDF propio con lectura condicional. La importación usa una identidad estable de comparación independiente de la identidad del requisito, permitiendo varias comparaciones del mismo requisito. Se reutiliza el importador histórico, sus recibos y su almacenamiento aislado; un requisito eliminado se conserva como comparación sin vínculo. La recuperación valida límites y referencias antes de crear el proyecto.

**Pruebas:** Miniflare y el runner empaquetado deben verificar aislamiento, dos comparaciones del mismo requisito, PDF presente y ausente, requisito eliminado, cambios concurrentes y reintentos sin duplicados. Las fuentes de más de 25 MiB siguen excluidas de recuperación y se rechazan antes de mutar.
