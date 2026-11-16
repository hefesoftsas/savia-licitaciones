# Proyectos y documentos web — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que una cuenta cree y consulte proyectos privados y guarde y recupere documentos mediante D1 y R2 locales.

**Architecture:** Better Auth determina el propietario; las consultas D1 filtran por ese propietario. El contenido binario se almacena en R2 con claves asignadas por el servidor, mientras D1 mantiene la relación y los metadatos. La API se prueba mediante Miniflare con D1 y R2.

**Tech Stack:** Workers, Better Auth, D1, R2, Miniflare, Node 22.

**Spec:** `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Global Constraints

- No desplegar recursos remotos, activar runners alojados ni usar Workers AI o AI Search.
- No almacenar datos empresariales en el navegador; no confiar en identificadores de propietario enviados por el cliente.
- Preservar los cambios existentes y las invariantes del escritorio; esta capacidad inicial no constituye la migración completa.
- Requests con cookies y métodos mutadores deben provenir del origen configurado de la aplicación.

## Review Focus

- Accesos sin sesión y de otra cuenta a proyectos o archivos se rechazan.
- Una carga errónea no debe producir un registro válido apuntando a un objeto inexistente.
- Un ID de archivo o proyecto no debe permitir leer contenido de otro propietario.
- Los nombres no definen las claves internas de R2 y se conservan como datos.
- D1 y R2 locales sobreviven el reinicio cuando se configura persistencia.

### Task 1: Proyectos privados

**Files:** Create `web-api/src/projects.js`, `web-api/migrations/0002_projects.sql`; modify `web-api/src/index.js`, `web-api/test/auth.test.mjs`.

**Interfaces:** `POST /api/projects` con JSON `{title}` crea un proyecto de la sesión; `GET /api/projects` devuelve `{projects}` del usuario; `GET /api/projects/:id` devuelve `{project}` o 404 sin revelar propiedad ajena.

- [ ] Añadir prueba en Miniflare con dos cuentas y aislamiento; ejecutarla y observar el fallo.
- [ ] Implementar migración, rutas y verificación de origen, y repetir la prueba.

### Task 2: Documentos privados

**Files:** Modify `web-api/src/projects.js`, `web-api/migrations/0002_projects.sql`, `web-api/wrangler.jsonc`, `web-api/test/auth.test.mjs`.

**Interfaces:** `POST /api/projects/:id/files` recibe un cuerpo binario y nombre en cabecera `X-File-Name` codificado con `encodeURIComponent`; devuelve `{file}`. `GET /api/projects/:id/files` lista los metadatos y `GET /api/projects/:id/files/:fileId` devuelve bytes. Siempre comprobar titularidad en D1 antes de R2.

- [ ] Añadir prueba de carga de bytes, listado, descarga y rechazo de acceso cruzado, además de persistencia tras reinicio.
- [ ] Implementar R2 y metadatos; limpiar el objeto si falla la inserción en D1; repetir la prueba.
- [ ] Ejecutar `pnpm run test:web-api`, `git diff --check` y comprobar Wrangler para ausencia de bindings de IA o runners alojados.
