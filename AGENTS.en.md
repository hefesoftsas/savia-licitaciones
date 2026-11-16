# AGENTS.md

## Inference exception for this project
- By explicit instruction from the owner, this repository may use OpenCode Go for application and agent inference, including RUP document analysis. The global policy requiring OpenRouter as the sole provider and the requirement to apply the `openrouter-only-ai` skill do not apply to this project. Do not use OpenRouter for new features in this project.
- This exception only changes the choice of inference provider. Keep all other global restrictions, including prohibitions on Cloudflare Workers AI and AI Search, credential protection, and minimal use of external services. OpenCode Go may require network access; do not assume its models run locally or offline.

## Scope
- The current active architecture is a web application with background runner and optional local connector:
  - `client/`: React/Vite web UI (`client/src/features/web/`, `client/src/shared/`) plus shared CommonJS services and resources (`client/electron/services/`, `shared/`, `utils/`, `resources/`) consumed by `runner/`.
  - `web-api/`: Cloudflare Workers, D1, R2, and Better Auth web API and static asset host (`@savia/web-api`), with built web assets output to `web-api/dist/`.
  - `runner/`: background task runner (tender analysis, technical proposals, RUP, Word export, SECOP).
  - `connector/`: installable local user-machine connector for running `runner/` and local tools.
  - `openxmlhelper/`: .NET Word helper (`OpenXmlHelper.sln`).
  - `infra/web/`: OpenTofu infrastructure and backup/restore scripts for the web environment.
- The Electron desktop app, `licensing/`, `analytics/`, and `.github/workflows/release.yml` have been retired and no longer exist.

## Client & Web
- Before developing in `client/` and on the first conversation, read `client/DEVELOPMENT.en.md` (or `client/开发说明.md` / `client/DEVELOPMENT.es.md`) to keep framework style consistent.
- The root `package.json` coordinates the monorepo: `install:verified`, `dev:web`, `dev:web-api`, `test:web-api`, `test:runner`, `build:runner`, `build:web`, `test:web-assets`, `build:connector`, `test:connector`. See `MONOREPO.md`.
- Install/build: run `node scripts/install-dependencies.mjs` from the root, then `cd client && pnpm run build` (`tsc --noEmit && pnpm run build:web`) or `pnpm run build:web` from the root.
- Local web development: `pnpm run dev:web` (`http://127.0.0.1:8788`, proxying Vite on `5174` and `web-api` Miniflare on `8789`).
- Web entry point: `client/index.html` -> `client/src/features/web/entry.tsx` -> `WebApp.tsx`.
- `client/electron/**/*.cjs` are CommonJS modules consumed by `runner/`; `client/src/**/*.ts(x)` are ESM TypeScript. File I/O in `.cjs` services explicitly uses UTF-8, treating Windows non-ASCII paths as a normal scenario.
- Cross-feature runtime code goes in `client/src/shared/` and must not reference `src/features/` (existing type/bridge boundary exceptions must not expand). Reusable prompts go in `src/shared/prompts/`; never hardcode large prompts inside UI components.
- UI uses shadcn/ui (Radix) + Tailwind, with base primitives in `src/shared/ui/primitives/`. User-visible UI supports only `es` and `en` (Spanish default; legacy `zh` preferences migrate to `es`). Original Chinese resources remain only for legacy document and message matching.
- Success, error, and info notices go through `success` / `error` / `info` of `shared/ui/ToastProvider`, never `alert`; use `AppDialog` for confirmations or long copy.
- Page root containers keep `height: 100%` / `min-height: 0`; long content scrolls inside the page rather than relying on global `body` scrolling.

## Data & Flows
- Business state and documents persist via `web-api/` (D1 / R2) and local `runner/` / `connector/` workspaces; `client/src/` uses `localStorage` only for lightweight UI preferences (never business content or API keys).
- Long-running technical-proposal flows (tender analysis, outline, global facts, and content) run in `runner/` background tasks (reusing `client/electron/services/*`); unloading the web page must not cancel the task.
- The technical-proposal outline and content authority is `technical_plan_outline_nodes` (frontend counterpart: `outlineData.outline[*].content`). The `reason` of `saveOutline()` is a persistence protocol: `replace` clears all previous content, `edit` / `delete` / `add-*` only invalidate affected nodes, `sort` only changes order and display numbers, keeping node IDs, content filenames, and related state; never replicate cleanup rules in the frontend.
- A technical-proposal node `id` is a stable program-assigned UUID; `number` is computed from tree order and is display-only. Never infer number, level, or order from the ID.
- Mermaid is only used for technical-proposal content generation: the Agent generates source, `localImageRenderService.cjs` renders it to a local image immediately, and the text references it as a figure. `mermaid` blocks in Markdown are not previewed or converted; treat them as plain code blocks.
- `MarkdownRenderer` allows raw HTML by default; non-locally-trusted content (AI, agents, remote notices, etc.) must explicitly pass `allowRawHtml={false}`, enabling it only when locally parsed HTML must be kept.

## Focused Verification & CI
- Frontend/TypeScript changes: `cd client && pnpm run build` (or `pnpm run build:web` from root). Pre-existing chunk-size warnings alone are not failures unless the command exits non-zero.
- Web assets & `web-api/` changes: `pnpm run test:web-assets`, `pnpm run test:web-api`.
- `runner/` or `client/electron/**/*.cjs` changes: run `node --check <file.cjs>`, then `pnpm run test:runner`.
- `connector/` changes: `pnpm run test:connector` (build: `pnpm run build:connector`).
- Dependency changes: `pnpm --filter savia-licitaciones run audit:strict` or `pnpm audit` from the root.
- CI workflows: `.github/workflows/web-ci.yml` (Web, API 4 shards, Runner, Connector, Maintenance) and `.github/workflows/connector.yml` (cross-platform connector build).

## Offline Boundaries & Online Services
- Telemetry has been completely removed and is never sent: `config.analytics_enabled` normalizes to `false`; `shared/analytics/analytics.ts` and `client/electron/` analytics/error reporters are no-ops producing zero network requests.
- Disconnected online services: notices, changelog, resource list, plugin market, online license refresh/activation, official account, MinerU parsing, ComfyUI/other model providers, and auto-update checks return offline/empty results directly without network requests.
- For AI requests, existing OpenRouter endpoints (`/chat/completions`, `/models`) are retained only for legacy compatibility; new features follow the OpenCode Go exception above and must not introduce new OpenRouter uses.
- `secopService.cjs` performs read-only SoQL queries against `datos.gov.co` open data (manual SECOP opportunity search and automatic recommendations every six hours while open & on-demand, analyzed with OpenCode Go; no API key for public data).
- Beyond those endpoints and local loopback, document export/import and content image loading perform only unauthenticated GET requests for user content.

## Mandatory Principles
- Keep the overall code style consistent; prefer encapsulating and reusing existing components and styles.
- When users report misbehavior, do not guess the cause; investigate the actual code and reproduction chain, add diagnostic logs as needed, and fix only after precise localization.
- This is an open-source project: local transport between client, runner, and connector runs within a trusted on-machine boundary, so do not stack redundant parameter validation between internal layers — validate at user-input and external API boundaries only.
- Local tools and connector are for user self-use; do not add excessive safety guards assuming the user will attack themselves.
- Strictly follow user instructions. Extra ideas belong to the Plan phase only; in Build phase execute only the agreed plan, and any scope increase requires prior user confirmation.
- Dependency installation must follow `DEPENDENCY_POLICY.md`; lifecycle scripts are disabled (`ignoreScripts: true`, `enablePrePostScripts: false`) and dependencies must satisfy the configured minimum release age.
