# UI migration implementation plan

**Goal:** Introduce shadcn/Radix basic controls and migrate Settings, support light/dark/system themes, and expose only Spanish and English.

**Architecture:** Keep React, Electron and existing IPC. Install Tailwind through Vite without resetting legacy document styles. Place reusable primitives in shared/ui/primitives and adapt existing wrappers. Persist appearance through configStore; retain legacy Chinese source-message matching where required to interpret existing data, but remove Chinese as a selectable/default UI language.

**Approved scope:** User request of 2026-10-28; begin implementation in the existing checkout after baseline c889c3c.

## Tasks
- [x] Repair build environment: use Node 22 x64 matching installed native modules, install shadcn dependencies and preserve lockfile portability.
- [x] Add regression coverage for legacy locale migration, two supported languages, and persisted light/dark/system preference.
- [x] Add primitives, Tailwind integration and theme tokens; migrate Settings controls and shared switch/input wrappers without changing business actions.
- [x] Add a theme provider, live system preference subscription, persistence and Settings selector; remove Chinese UI selection and fallback.
- [x] Build, run targeted tests and dependency audit, and inspect Settings in both languages/themes, including keyboard controls and scrolling.

## Review focus
- Saving unrelated settings must preserve language and theme.
- Stored Chinese locale must migrate to Spanish; English must remain English.
- System theme must react to OS changes; explicit themes must ignore them.
- Dialogs and notifications must remain legible above the page.
- Legacy Word/Markdown content styles and existing task behavior must survive the Tailwind integration.

## Verification
- Targeted locale/config tests: 17 passing.
- Electron Settings fixture: themes and persistence, OS theme changes, ES/EN, keyboard tabs, dialog hit testing/Escape and internal scrolling passed.
- Visual inspection: dark Spanish Settings and light English Settings/storage dialog.
- Independent review fixes: dialog stacking and custom widths, dark storage/about/privacy surfaces.
- Run the appearance smoke check with Vite on 127.0.0.1:5173, then run npm run check:appearance in client. It uses an isolated temporary profile and mocked configuration; it does not modify user data.
- Final clean verification with Node 22 x64: npm ci, npm run build and npm run smoke:electron-native succeeded; npm audit reports zero vulnerabilities. Build retains existing document-editor externalization and large-chunk warnings.
