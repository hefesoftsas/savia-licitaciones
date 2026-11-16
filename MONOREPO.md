# Monorepo de Savia

- `client/`: interfaz web en React/Vite (`src/features/web/`, `src/shared/`) y servicios compartidos en `client/electron/` (`services/`, `shared/`, `utils/`, `resources/`) utilizados por `runner/`.
- `web-api/`: API web y servicio de archivos estáticos en Cloudflare Workers, D1, R2 y Better Auth (`@savia/web-api`), con desarrollo local en Wrangler/Miniflare.
- `runner/`: ejecutor de tareas en segundo plano (análisis de pliegos, propuestas técnicas, RUP, exportación Word y consultas SECOP).
- `connector/`: conector local instalable en el equipo del usuario para ejecutar el runner y herramientas locales.
- `openxmlhelper/`: auxiliar .NET (`OpenXmlHelper.sln`) para generación y edición de documentos Word.
- `infra/web/`: infraestructura OpenTofu y scripts de respaldo y restauración para el entorno web.

El repositorio utiliza pnpm 11.24.0, `pnpm-workspace.yaml` (`client` y `web-api`) y un único `pnpm-lock.yaml`. Instala con `node scripts/install-dependencies.mjs` (o `pnpm run install:verified`). Desde la raíz están disponibles `pnpm run dev:web`, `pnpm run dev:web-api`, `pnpm run build:web`, `pnpm run build:runner`, `pnpm run build:connector`, `pnpm run test:web-assets`, `pnpm run test:web-api`, `pnpm run test:runner` y `pnpm run test:connector`.

Consulta [la política de dependencias](DEPENDENCY_POLICY.md) para los controles de antigüedad y scripts, y la documentación de cada módulo (`web-api/README.md`, `runner/README.md`, `connector/README.md`, `infra/web/README.md`).

### Desarrollo web con actualización automática

Ejecuta `pnpm run dev:web` desde la raíz y abre `http://127.0.0.1:8788`. Vite actualiza la interfaz al guardar cambios y la API se ejecuta en Miniflare. El servidor conserva los datos locales de Savia Web Preview; para usar otro directorio, define `SAVIA_WEB_STATE_DIR`. Los puertos 8788, 8789 y 5174 deben estar libres. Detén el proceso con Ctrl+C.
