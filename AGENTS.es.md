# AGENTS.md

## Excepción de inferencia para este proyecto
- Por instrucción expresa del propietario, este repositorio puede usar OpenCode Go para la inferencia de la aplicación y sus agentes, incluido el análisis de documentos RUP. La política global que exige OpenRouter como único proveedor y el requisito de aplicar la skill `openrouter-only-ai` no se aplican a este proyecto. No usar OpenRouter para nuevas funciones de este proyecto.
- Esta excepción solo cambia la elección del proveedor de inferencia. Mantener las demás restricciones globales, incluidas las prohibiciones de Cloudflare Workers AI y AI Search, la protección de credenciales y el uso mínimo de servicios externos. OpenCode Go puede requerir conexión de red; no asumir que sus modelos se ejecutan localmente ni que funcionan sin conexión.

## Alcance
- La arquitectura activa del producto es una aplicación web con ejecutor en segundo plano y conector local opcional:
  - `client/`: interfaz web en React/Vite (`client/src/features/web/`, `client/src/shared/`) y servicios/recursos CommonJS compartidos (`client/electron/services/`, `shared/`, `utils/`, `resources/`) consumidos por `runner/`.
  - `web-api/`: API web y servicio de archivos estáticos en Cloudflare Workers, D1, R2 y Better Auth (`@savia/web-api`), con artefactos web compilados en `web-api/dist/`.
  - `runner/`: ejecutor de tareas en segundo plano (análisis de pliegos, propuestas técnicas, RUP, exportación Word y SECOP).
  - `connector/`: conector local instalable en el equipo del usuario para ejecutar `runner/` y herramientas locales.
  - `openxmlhelper/`: auxiliar .NET para Word (`OpenXmlHelper.sln`).
  - `infra/web/`: infraestructura OpenTofu y scripts de respaldo/restauración para el entorno web.
- La aplicación de escritorio Electron, `licensing/`, `analytics/` y `.github/workflows/release.yml` fueron retirados y ya no existen.

## Client y Web
- Antes de desarrollar en `client/` y en la primera conversación, lea `client/DEVELOPMENT.es.md` (o `client/开发说明.md` / `client/DEVELOPMENT.en.md`) para mantener la coherencia con el estilo del proyecto.
- El `package.json` de la raíz coordina el monorepo: `install:verified`, `dev:web`, `dev:web-api`, `test:web-api`, `test:runner`, `build:runner`, `build:web`, `test:web-assets`, `build:connector`, `test:connector`. Consulte `MONOREPO.md`.
- Instalación/compilación: ejecute `node scripts/install-dependencies.mjs` desde la raíz y luego `cd client && pnpm run build` (`tsc --noEmit && pnpm run build:web`) o `pnpm run build:web` desde la raíz.
- Desarrollo web local: `pnpm run dev:web` (`http://127.0.0.1:8788`, con Vite en `5174` y `web-api` Miniflare en `8789`).
- Punto de entrada web: `client/index.html` -> `client/src/features/web/entry.tsx` -> `WebApp.tsx`.
- `client/electron/**/*.cjs` son módulos CommonJS consumidos por `runner/`; `client/src/**/*.ts(x)` son ESM TypeScript. La lectura/escritura de archivos en `.cjs` usa UTF-8 explícito y contempla rutas de Windows con caracteres no ASCII.
- El código compartido entre funcionalidades va en `client/src/shared/` y no debe referenciar `src/features/` (las excepciones existentes de tipos bridge/barrel no deben ampliarse). Los prompts reutilizables van en `src/shared/prompts/`; no incruste prompts extensos dentro de componentes de UI.
- La UI usa shadcn/ui (Radix) + Tailwind, con primitivos en `src/shared/ui/primitives/`. La interfaz visible al usuario solo soporta `es` y `en` (español por defecto; las preferencias heredadas `zh` migran a `es`). Los recursos históricos en chino se conservan únicamente para compatibilidad con documentos y mensajes antiguos.
- Los avisos de éxito, error e información usan `success` / `error` / `info` de `shared/ui/ToastProvider`, nunca `alert`; para confirmaciones o textos largos use `AppDialog`.
- La raíz de cada página mantiene `height: 100%` / `min-height: 0`; el contenido largo se desplaza dentro de la página sin depender del scroll global de `body`.

## Datos y flujos
- El estado de negocio y los documentos persisten en `web-api/` (D1 / R2) y en los espacios locales de `runner/` / `connector/`; `client/src/` solo usa `localStorage` para preferencias ligeras de UI (nunca contenido de negocio ni API Keys).
- Los flujos largos de propuesta técnica (análisis del pliego, índice, hechos globales y contenido) se ejecutan en tareas en segundo plano de `runner/` (reutilizando `client/electron/services/*`); cerrar o recargar la página no debe cancelar la tarea.
- El índice y el contenido de la propuesta técnica tienen como autoridad `technical_plan_outline_nodes` (en el frontend: `outlineData.outline[*].content`). El `reason` de `saveOutline()` es un protocolo de persistencia: `replace` limpia todo el contenido anterior, `edit` / `delete` / `add-*` solo invalidan los nodos afectados, `sort` solo cambia el orden y los números visibles, manteniendo ID de nodo, nombres de archivo y estado; no replique las reglas de limpieza en el frontend.
- El `id` de nodo de la propuesta técnica es un UUID estable asignado por el programa; `number` se calcula según el orden del árbol y solo sirve para visualización. Nunca deduzca número, nivel u orden a partir del ID.
- Mermaid solo se usa para generar el contenido de la propuesta técnica: el Agent genera el código fuente, `localImageRenderService.cjs` lo convierte inmediatamente a imagen local y el texto lo cita como figura. Los bloques `mermaid` en Markdown no se previsualizan ni convierten; se tratan como bloques de código normales.
- `MarkdownRenderer` permite por defecto HTML crudo; el contenido no confiable (IA, agentes, avisos remotos, etc.) debe pasar explícitamente `allowRawHtml={false}`, activándolo solo cuando se necesite conservar el HTML local analizado.

## Verificación enfocada y CI
- Cambios en frontend/TypeScript: `cd client && pnpm run build` (o `pnpm run build:web` desde la raíz). Los avisos previos de tamaño de chunk por sí solos no son fallo salvo que el comando devuelva distinto de 0.
- Cambios en activos web o `web-api/`: `pnpm run test:web-assets`, `pnpm run test:web-api`.
- Cambios en `runner/` o `client/electron/**/*.cjs`: ejecute `node --check <file.cjs>` y luego `pnpm run test:runner`.
- Cambios en `connector/`: `pnpm run test:connector` (compilación: `pnpm run build:connector`).
- Cambios en dependencias: `pnpm --filter savia-licitaciones run audit:strict` o `pnpm audit` desde la raíz.
- Flujos de CI: `.github/workflows/web-ci.yml` (Web, API en 4 shards, Runner, Connector, Maintenance) y `.github/workflows/connector.yml` (compilación multiplataforma del conector).

## Límites offline y servicios en línea
- La telemetría está totalmente eliminada y nunca se envía: `config.analytics_enabled` se normaliza a `false`; `shared/analytics/analytics.ts` y los reportes de analítica/errores en `client/electron/` son no-ops sin ninguna petición de red.
- Servicios en línea desconectados: avisos, changelog, lista de recursos, mercado de plugins, refresco/activación de licencias en línea, cuenta oficial, análisis MinerU, ComfyUI/otros proveedores de modelos y comprobación de auto-actualización devuelven resultados vacíos/offline directos sin peticiones de red.
- En peticiones de IA, las rutas existentes de OpenRouter (`/chat/completions`, `/models`) se conservan solo por compatibilidad heredada; las nuevas funciones siguen la excepción de OpenCode Go de este archivo y no introducen nuevos usos de OpenRouter.
- `secopService.cjs` realiza consultas SoQL de solo lectura contra datos abiertos de `datos.gov.co` (búsqueda manual de oportunidades SECOP y recomendaciones automáticas cada seis horas mientras esté abierto y bajo demanda, analizadas con OpenCode Go; sin clave para datos públicos).
- Fuera de esos puntos y del loopback local, la exportación/importación de documentos y la carga de imágenes de contenido solo realizan peticiones GET sin credenciales para contenido del usuario.

## Principios obligatorios
- Mantenga en lo posible un estilo de código uniforme; priorice encapsular y reutilizar componentes y estilos existentes.
- Ante una anomalía funcional, no adivine la causa; investigue el código real y la cadena de reproducción, añada registros de diagnóstico si hace falta y corrija solo tras localizar con precisión.
- Este es un proyecto de código abierto: la transmisión local entre cliente, runner y conector opera dentro de un límite confiable en la máquina del usuario, por lo que no se apilan validaciones repetidas entre capas internas; solo se valida en la capa de entrada del usuario y en los límites de API externa.
- Las herramientas locales y el conector son para uso propio del usuario; no añada protecciones de seguridad excesivas asumiendo que el usuario se atacará a sí mismo.
- Respete estrictamente las instrucciones del usuario. Las ideas adicionales solo se plantean en fase Plan; en fase Build solo se ejecuta el plan acordado, y cualquier ampliación requiere confirmación previa del usuario.
- La instalación de dependencias debe seguir `DEPENDENCY_POLICY.md`; los scripts de ciclo de vida están desactivados (`ignoreScripts: true`, `enablePrePostScripts: false`) y las dependencias deben cumplir la antigüedad mínima configurada.
