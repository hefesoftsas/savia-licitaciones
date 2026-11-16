# Savia Licitaciones and selectable visual styles

Continue the authorized UI migration inline from checkpoint e9afed6. Use Savia Licitaciones as the provisional product name. Adapt Vega, Nova, Maia, Lyra and Mira from the official Create style descriptions as runtime visual presets; retain independent accent color and light/dark/system preferences, ES/EN, local configuration and auxiliary-window synchronization.

1. Add persisted visual-style options, accessible settings controls and shared density/radius tokens without styling user document content.
2. Rename active client branding, bridge/types, internal identifiers, packaging and the Open XML helper namespace. Preserve old profiles, database files, asset URLs and document markers through explicit compatibility data; preserve historical analytics infrastructure.
3. Verify configuration persistence, legacy workspace/document compatibility, syntax, native SQLite, the helper build, production build and real Electron appearance/navigation. Perform one final independent review and commit locally.

Naming proposal: Savia Licitaciones is the working brand; Savia Propuestas remains a possible broader name if the product later extends beyond tenders. No publishing or remote repository rename is part of this change.

Sources: https://ui.shadcn.com/create ; https://ui.shadcn.com/docs/theming ; https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/styles.tsx . Runtime styles are adaptations to this existing Radix/Electron application, not a destructive regeneration with the CLI.

## Execution and verification
- Implemented five visual styles with independent color/mode and backend persistence. A failing persistence test preceded implementation. Real Electron checks cover 20 style/language/mode combinations, reload persistence, legacy document markers, visible geometry and text clearance in dense controls.
- Renamed the client bridge to `window.savia`, product/package/artifacts, helper namespaces, prompts, fixtures and active development documentation. Current profile, database paths and asset formats use Savia identifiers. Historical analytics infrastructure is outside the active client scope.
- Final independent review found three important compatibility issues: rejection-review signature delimiters, offline-license machine identity and release signing environment names. Fixed all three. License and signature regressions were reproduced before fixes and pass after; a temporary-key integration test confirms signed Savia build metadata, and both CI jobs map existing secrets to the new environment names.
- Verification passed: 20 focused tests, 152 route/workflow renders with zero console errors, shared keyboard/modal/preview checks, native SQLite smoke, 63 changed CommonJS syntax checks and Open XML helper build (17 existing warnings, zero errors). Dependency audit: zero vulnerabilities. TypeScript and production build passed; final CSS bundle is refreshed after the dense-control text fix.
- The user-owned untracked launcher is preserved untouched. No remote publishing or repository rename was performed.
