# AGENTS.md

## Excepción de inferencia para este proyecto
- Por instrucción expresa del propietario, este repositorio puede usar OpenCode Go para la inferencia de la aplicación y sus agentes, incluido el análisis de documentos RUP. La política global que exige OpenRouter como único proveedor y el requisito de aplicar la skill `openrouter-only-ai` no se aplican a este proyecto. No usar OpenRouter para nuevas funciones de este proyecto.
- Esta excepción solo cambia la elección del proveedor de inferencia. Mantener las demás restricciones globales, incluidas las prohibiciones de Cloudflare Workers AI y AI Search, la protección de credenciales y el uso mínimo de servicios externos. OpenCode Go puede requerir conexión de red; no asumir que sus modelos se ejecutan localmente ni que funcionan sin conexión.

## 范围
- 当前有效产品架构为 Web 应用与后台执行体系：
  - `client/`：React/Vite Web 前端（`client/src/features/web/`、`client/src/shared/`）以及供 `runner/` 复用的共享 CommonJS 服务与资源（`client/electron/services/`、`shared/`、`utils/`、`resources/`）。
  - `web-api/`：基于 Cloudflare Workers、D1、R2 与 Better Auth 的 Web API 与静态资源托管（`@savia/web-api`），构建产物输出到 `web-api/dist/`。
  - `runner/`：后台任务执行器（标书分析、技术方案、RUP、Word 导出、SECOP 等）。
  - `connector/`：用户本机可安装的本地连接器，用于运行 `runner/` 与本地工具。
  - `openxmlhelper/`：.NET Word 辅助程序（`OpenXmlHelper.sln`）。
  - `infra/web/`：Web 环境的 OpenTofu 基础设施与备份恢复脚本。
- Electron 桌面端、`licensing/`、`analytics/` 与 `.github/workflows/release.yml` 已移除，不再存在。

## Client 与 Web
- 开发 `client/` 前以及初次对话时，必须先完整阅读 `client/开发说明.md`（或 `DEVELOPMENT.en.md` / `DEVELOPMENT.es.md`），保持框架风格一致性。
- 根目录 `package.json` 提供 monorepo 协调命令：`install:verified`、`dev:web`、`dev:web-api`、`test:web-api`、`test:runner`、`build:runner`、`build:web`、`test:web-assets`、`build:connector`、`test:connector`。详见 `MONOREPO.md`。
- Web 安装/构建：在根目录执行 `node scripts/install-dependencies.mjs`，在 `client/` 下执行 `pnpm run build`（等价 `tsc --noEmit && pnpm run build:web`）或在根目录执行 `pnpm run build:web`。
- 本地 Web 开发：`pnpm run dev:web`（`http://127.0.0.1:8788`，代理 Vite `5174` 与 `web-api` Miniflare `8789`）。
- Web 入口：`client/index.html` -> `client/src/features/web/entry.tsx` -> `WebApp.tsx`。
- `client/electron/**/*.cjs` 为 CommonJS 模块，供 `runner/` 消费；`client/src/**/*.ts(x)` 为 ESM TypeScript。文件读写显式使用 UTF-8，并把 Windows 中文路径当默认场景处理。
- `client/src/shared/` 存放跨功能运行时代码，不得引用 `src/features/`（现有 bridge/type barrel 边界例外不扩展）。可复用 Prompt 放 `src/shared/prompts/`；不要在产品组件内硬编码大段 Prompt。
- UI 使用 shadcn/ui（Radix）+ Tailwind，基础组件位于 `src/shared/ui/primitives/`。用户可见界面仅支持 `es`/`en`，默认西班牙语，旧 `zh` 偏好迁移到 `es`。原始中文资源仅用于历史文档和消息匹配。
- 成功、失败和普通提示走 `shared/ui/ToastProvider` 的 `success` / `error` / `info`，不要用 `alert`；确认或长文案使用 `AppDialog`。
- 页面根容器保持 `height: 100%`/`min-height: 0`，长内容在页面内部滚动；不要依赖 `body` 全局滚动或为 `FloatingToolbar` 额外留大空白。

## 数据与流程
- 业务状态与文档通过 `web-api/`（D1 / R2）以及本地 `runner/` / `connector/` 工作区持久化；`client/src/` 只用 `localStorage` 存轻量 UI 偏好，不在浏览器侧保存业务正文或 API Key。
- 标书分析、技术方案目录、全局事实和正文等耗时流程在 `runner/` 后台任务中运行（复用 `client/electron/services/*`）；页面卸载不应取消任务。
- 技术方案目录与正文以 `technical_plan_outline_nodes`（前端对应 `outlineData.outline[*].content`）为权威。`saveOutline()` 的 `reason` 是持久化协议：`replace` 清空全部旧正文，`edit` / `delete` / `add-*` 只使受影响节点失效，`sort` 只改变顺序和显示编号，保持节点 ID、正文文件名和相关状态不变；不要在前端复制清理规则。
- 技术方案节点 `id` 是程序分配的稳定 UUID；`number` 按目录树顺序计算，仅供展示和章节编号。不得从 ID 推算编号、层级或顺序。
- Mermaid 只用于技术方案正文生成：Agent 生成源码后，由 `localImageRenderService.cjs` 立即在本地转成图片，正文以 figure 引用。Markdown 中的 `mermaid` 代码块不再预览或转图，按普通代码块处理。
- `MarkdownRenderer` 当前默认允许原始 HTML；AI、Agent、远程公告等非本地可信内容必须显式传 `allowRawHtml={false}`，只有明确需要保留本地解析 HTML 时才开启。

## 聚焦验证与 CI
- 改前端/TypeScript：`cd client && pnpm run build`（或根目录 `pnpm run build:web`）。`pnpm run build` 可能只有既有 chunk 体积警告；不要把它当失败，除非命令退出非 0。
- 改 Web 资源或 `web-api/`：`pnpm run test:web-assets`、`pnpm run test:web-api`。
- 改 `runner/` 或 `client/electron/**/*.cjs`：先运行 `node --check <file.cjs>`，再跑 `pnpm run test:runner`。
- 改 `connector/`：`pnpm run test:connector`（构建：`pnpm run build:connector`）。
- 改依赖：`pnpm --filter savia-licitaciones run audit:strict` 或根目录 `pnpm audit`。
- CI 工作流：`.github/workflows/web-ci.yml`（Web、API 4 分片、Runner、Connector、Maintenance）与 `.github/workflows/connector.yml`（跨平台连接器构建）。

## 离线边界与在线服务
- 遥测已彻底移除，不再发送：`config.analytics_enabled` 恒为 `false` 归一化；`shared/analytics/analytics.ts` 及 `client/electron/` 相关遥测/错误上报均为无操作，不产生任何网络请求。
- 废弃在线服务已断开：公告、更新日志、资源列表、插件市场、授权在线刷新/激活、官方账户、MinerU 解析、ComfyUI/其他模型服务商、自动更新检查的入口函数均返回离线/空结果，不发起网络请求。
- 现有 AI 请求中，OpenRouter 仅保留既有端点（`/chat/completions`、`/models`），新功能遵循本文件的 OpenCode Go 例外，不引入新的 OpenRouter 用途。
- `secopService.cjs` 可对 `datos.gov.co` 开放数据进行只读 SoQL 查询（SECOP 机会搜索支持用户手动触发；机会推荐在应用开启时每六小时及按需触发，使用 OpenCode Go 分析，公开数据查询无 Key）。
- 除上述接口与本地环回外，文档导出/导入及配图加载仅允许对用户内容进行无凭证 GET。

## 必须遵守的原则
- 尽量保持整体编码风格统一；前端组件和样式优先封装、复用现有实现。
- 当用户提出功能异常时，不要猜原因；先真实排查代码和复现链路，按需增加诊断日志，精准定位后再修复。
- 这是一个开源项目，客户端与本地 runner/connector 内部传输属于用户本机可信边界，不在内部层级间重复堆叠参数校验，只在用户输入层及外部 API 边界进行校验，进入内部传输之后不再层层重复校验。
- 本地工具与连接器面向用户自用，不添加针对用户自我攻击的过度安全性兜底。
- 严格遵守用户命令。额外想法只在 Plan 阶段提出；进入 Build 阶段后仅执行确认方案，如需增加范围必须先向用户确认。
- La instalación de dependencias debe seguir `DEPENDENCY_POLICY.md`; los scripts de ciclo de vida están desactivados (`ignoreScripts: true`, `enablePrePostScripts: false`) y las dependencias deben cumplir la antigüedad mínima configurada.
