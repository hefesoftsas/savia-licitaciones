# Importación de originales del plan desde respaldo

**Objetivo:** transferir al proyecto web importado los documentos originales de licitación disponibles en el respaldo de escritorio.

**Arquitectura:** el lector identifica rutas relativas del proyecto activo y de instantáneas inactivas, verifica su presencia en el ZIP ya validado y conserva nombre, identidad y bytes. Tras crear o recuperar el proyecto, el runner sube cada archivo a R2 mediante una ruta autenticada y asociada al recibo de importación. D1 registra el vínculo por identidad de origen y hash; reintentos son idempotentes y cargas concurrentes no sobrescriben datos.

**Tecnologías:** Node 22, respaldo de escritorio, Better Auth/runners, D1, R2 y Miniflare. Diseño `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Condiciones
- No usar rutas absolutas ni salir del respaldo; admitir separadores de Windows. Informar los originales ausentes, externos o superiores a 25 MiB sin afirmar que se importaron.
- Preservar bytes y nombre; no sustituir un original por Markdown ni enviar archivos no asociados al proyecto seleccionado.
- Un archivo por identidad de origen; reintentos con mismo contenido devuelven el mismo archivo, cambios incompatibles producen conflicto.
- Las cargas R2 y las transacciones D1 deben limpiar el objeto propio al fallar sin borrar objetos de otras operaciones.
- No alterar respaldo ni escritorio; no activar servicios alojados ni inferencia adicional.

## Verificación
1. Lector: rutas de proyectos activo/inactivo, Windows, faltantes, externas y archivos idénticos; mostrar conteos.
2. API: aislamiento de cuenta, hashes, cargas simultáneas, reintento, conflicto, revocación, fallo de D1 y limpieza R2.
3. CLI: captura real de SQLite, importación a Miniflare, reintentos, descargas idénticas y mensajes de faltantes.
4. Suites API/runner, distribución del runner y compilaciones relevantes.
