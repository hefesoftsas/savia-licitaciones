# Complete UI migration implementation plan

**Goal:** Complete the existing shadcn migration across the desktop client, with light/dark/system themes and Spanish/English UI.

**Architecture:** Extend the existing shared primitives and semantic theme tokens. Preserve feature workflows, IPC, document rendering and task lifecycle. Migrate actual JSX controls, overlays and tables rather than applying a cosmetic global reset. Keep specialized document canvases in their document colors.

**Tech stack:** React, TypeScript, shadcn/Radix, Tailwind utilities, Electron.

**Authorization:** The user explicitly requested continuous execution through completion, extending the first stage at 530cb4a. Continue in this checkout and preserve the personal untracked launcher.

## Constraints and review focus
- Spanish and English only at runtime; legacy source-message matching may remain for imported data and backend compatibility.
- Preserve native file inputs, numeric/select change events, keyboard interaction, refs, disabled state and focus.
- Preserve modal blocking, nested overlays, custom dialog sizes and scrolling.
- Theme all application chrome including auxiliary windows; do not recolor user documents or images.
- Retain existing workflow state, guards and backend persistence. No network services or business changes.

## Tasks
- [x] Inventory all routes, auxiliary windows, raw controls, Radix imports and fixed colors.
- [x] Extend shared primitives (tables, tooltip, popover, checkbox/radio and toast) and migrate controls across all feature/shared/app components, preserving handlers and refs.
- [x] Consolidate dialogs and navigation patterns using shadcn primitives, retaining accessible titles/descriptions and specialized modal behavior.
- [x] Migrate application colors to semantic theme tokens, including nested surfaces and auxiliary windows; normalize language fallbacks and remove Chinese UI leaks.
- [x] Extend the Electron fixture to cover every main route and auxiliary window in both languages/themes, representative interactions, focus/scrolling and document preview isolation.
- [x] Run TypeScript/build, targeted regression tests, UI checks and dependency audit as applicable; fix review findings and commit the component migration checkpoint.

## Progress
- Baseline: 97 TSX files; 664 raw-control/Radix matches in 77 files. Settings and basic shared controls migrated previously.
- Execution: inline implementation with one independent final code review.
- Progress: migrated controls in 67 files; centralized raw Radix overlays/tooltips/toasts; migrated all tablists; migrated application CSS and inline colors; auxiliary windows use shared appearance providers and transient cross-window notifications. First complete matrix: 88 renders (22 routes × 2 languages × 2 themes), no console errors, Chinese text or body overflow in visible text. Follow-up includes form values, nested interactions and auxiliary windows. Preview verification needs local .NET 10 SDK; installation is isolated under TEMP.
- Final UI matrix: 152 route/workflow renders, zero console errors, Chinese UI text or body overflow (including form values). Real Electron Main/preload and temporary database, with actual Word preview generation. Auxiliary windows load saved appearance and follow live language/theme changes; system theme responds to OS appearance. Shared checks cover modal viewport geometry, empty toast hit area, slider naming, keyboard slider/checkbox and Escape.
- Final review: three actionable issues reproduced and fixed: fullscreen centering, toast viewport click interception and slider accessible naming. Each focused assertion failed before its fix and passes afterward. Backend business logic was outside review scope and is preserved; only built-in English numbering localization was added after the real preview exposed a missing translation.
- Regression checks: 20 targeted assertions pass, including appearance broadcasts, locale/config behavior, built-in numbering and display aliases preserving custom data. Clean `npm ci` and production build pass, with zero audit vulnerabilities. Electron native SQLite smoke and narrow-window appearance checks pass. Additional template editor matrix: 32 renders, zero console errors, Chinese text or overflow. Read-only defaults localize independently of saved custom templates.

## Visual direction correction
The user clarified that component replacement is insufficient and requested the visual structure of the official shadcn Blocks. Preserve this component migration as a checkpoint, then adopt dashboard-01/sidebar-07 navigation, inset workspace, compact header and restrained surfaces across the app. Keep all workflows, themes, ES/EN and document rendering intact. Goal remains active until the visual redesign is complete.

## Reproducing UI checks
The Blocks visual stage adopts the official Sidebar and Sheet primitives, grouped collapsible navigation, an inset workspace, compact breadcrumb/header and neutral feature surfaces. It retains existing navigation guards and project actions. Review found macOS titlebar overlap and an unnamed collapsed home button; both assertions failed before fixes and passed afterward. Mobile help dialog focus and Escape also pass.

The user subsequently chose neutral as the default and requested selectable color themes independently of light/dark mode. Settings now offers neutral, blue, green, violet and rose, stored in Main configuration. A new configuration regression failed before implementation and passes afterward (21 targeted tests total).

Final visual-stage verification: 152 route/workflow renders pass with zero console errors. Shared modal, preview and keyboard checks pass; the narrow settings appearance check passes. All ten color/mode combinations produce distinct accents, preserve their independent mode, persist after reload and synchronize with auxiliary windows. Desktop/mobile screenshots and the light/dark blue settings pair were inspected. Production build passes, including TypeScript and Vite/Rollup; existing document-editor externalization and large-chunk warnings remain non-fatal.

`npm run check:blocks` checks desktop and narrow-window layout, sidebar collapse and mobile navigation. Set `UI_CHECK_FOCUS=mac`, `navigation` or `colors` for titlebar geometry, nested help dialogs, or color persistence and auxiliary-window synchronization, respectively.

Start Vite on `127.0.0.1:5173` (`npx vite --host 127.0.0.1 --port 5173 --strictPort`), then run `npm run check:ui` from `client/`. The harness creates temporary profiles and never uses the normal application database. Word preview checks use the existing .NET helper development requirements. Set `UI_SCREENSHOTS=1` to capture each main route; screenshots and results go to the system temporary directory. `npm run check:appearance` also covers narrow settings layouts and keyboard tabs.
