# Importación de planes desde respaldo de escritorio

**Objetivo:** inspeccionar un respaldo real de empresa y copiar explícitamente planes técnicos a proyectos web nuevos, preservando IDs, jerarquía, orden y contenido sin modificar el original.

**Arquitectura:** el runner verifica el ZIP y los hashes mediante el lector existente, abre una copia SQLite temporal de solo lectura y lee las instantáneas serializadas de proyectos inactivos. Un comando muestra proyectos y limitaciones; otro envía el plan elegido a una API autenticada por runner que crea un proyecto nuevo en una transacción D1 idempotente. Nunca transfiere el respaldo completo ni sustituye un proyecto.

**Tecnologías:** Node 22, SQLite local, formato `savia-company-backup` v1, D1, Better Auth/runners y Miniflare. Diseño `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Alcance y restricciones
- Solo estructura y contenido de nodos; documentos adjuntos, imágenes, hechos, tareas, sesiones y otros datos aún no se importan. Informar explícitamente.
- Validar hashes, versión SQLite, integridad, límites, IDs únicos, padres, ciclos y profundidad antes de crear un proyecto.
- No borrar ni modificar respaldo, datos de escritorio o proyectos web existentes; importación atómica e idempotente.
- La autenticación del runner define el propietario. No inferencia, Workers AI ni runner alojado.

## Verificación
1. Crear respaldos reales con SQLite y snapshots, verificar activos e inactivos, daños y rutas incompatibles.
2. Probar API Miniflare con dos cuentas, orden, contenido, reintentos, modificaciones, nodos inválidos y falla transaccional.
3. Verificar CLI/distribución, limpieza temporal y flujo completo con servidor local.
4. Suites de API y runner, chequeos Node y compilaciones pertinentes.
