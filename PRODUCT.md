# Savia Licitaciones

The Savia Licitaciones web application (`client/` + `web-api/`, backed by `runner/` and the optional local `connector/`) helps users find and organize Colombian public tenders, prepare bid and feasibility documents, maintain reusable company materials, and review documents. Workspaces, documents, and configuration persist in the web backend (`web-api/` with D1/R2) and local runner/connector workspaces. Existing SECOP and configured AI integrations retain their established behavior.

## Product commitments
- Preserve the current workflows, background tasks, project switching, editing and export behavior.
- Interface languages: Spanish and English. Color themes: neutral (default), blue, green, violet and rose. Display modes: light, dark and system, independent of the color theme.
- Visual styles: Vega, Nova, Maia, Lyra and Mira, adapted from shadcn Create and persisted in user preferences. Savia Licitaciones is the provisional brand. Compatibility data preserves existing workspaces and document formats.
- User documents and custom templates retain their content and formatting independently of app appearance.
- The user explicitly requested the familiar visual grammar of the official shadcn Blocks, particularly a compact sidebar and dashboard workspace. Component substitution alone did not meet that expectation.
- Do not invent metrics, projects, charts, user identities or backend capabilities to imitate sample dashboards.
