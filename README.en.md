# Savia Licitaciones

Savia helps organize procurement processes, manage company documents, and prepare proposals. It is a web application (`client/` + `web-api/`) backed by a task runner (`runner/`) and an optional local connector (`connector/`) installed on the user's computer.

## Development

Node.js 22.13 or later and pnpm 11.24.0 are required. Install dependencies according to [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md):

```sh
node scripts/install-dependencies.mjs
pnpm run build:web
```

Run `pnpm run dev:web` to start the web application in development (Vite UI and Miniflare API). From the root, you can run `pnpm run test:web-assets`, `pnpm run test:web-api`, `pnpm run test:runner`, and `pnpm run test:connector`. See [MONOREPO.md](MONOREPO.md) and the component documentation for additional requirements.

## Security and contributions

See [SECURITY.en.md](SECURITY.en.md) and [CONTRIBUTING.en.md](CONTRIBUTING.en.md). Do not include credentials or sensitive documents in public issues or changes.
