# Cola de tareas para runner local — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar solicitudes de trabajo de usuarios en D1 y permitir que un runner autorizado las reclame y termine sin duplicar reclamaciones ni aceptar resultados de concesiones caducadas.

**Architecture:** Cada trabajo pertenece al dueño de un proyecto. El runner anuncia explícitamente los tipos que soporta y reclama con una operación D1 atómica. Un token temporal de concesión se guarda como hash; el resultado solo se acepta para el runner y la concesión vigente. Al observar una concesión expirada el estado pasa a `interrupted`; no se vuelve a ejecutar automáticamente porque la ejecución pudo producir efectos locales.

**Tech Stack:** Cloudflare Workers, D1, Web Crypto, Better Auth, Miniflare.

**Spec:** `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Global Constraints

- Solo runners locales autorizados; no desplegar ni activar ejecución alojada ni inferencia de Cloudflare.
- Proyectos y trabajos se filtran por usuario y el ID del usuario se deriva de la sesión o token del runner.
- Los tokens y credenciales no se escriben en logs ni se almacenan en texto en D1.
- Las operaciones web mutadoras requieren el origen autorizado.
- No hay recuperación automática de una concesión perdida ni ejecutor Pi en esta etapa; no confundir esta cola con paridad funcional.

## Review Focus

- Dos runners concurrentes no reclaman la misma tarea.
- Otro usuario no puede ver trabajos o reclamar tareas de la cuenta dueña.
- Una concesión caducada o cancelada no puede completar el trabajo, incluso tras una reconexión.
- Un runner no recibe tipos que no anunció y el trabajo no se pierde cuando está desconectado.
- Los resultados de finalización repetidos por la misma concesión son idempotentes y no cambian el resultado.

### Task 1: Cola y concesiones con control de usuario

**Files:** Create `web-api/src/jobs.js`, `web-api/migrations/0004_jobs.sql`, `web-api/test/jobs.test.mjs`; modify `web-api/src/index.js` and `web-api/src/runners.js`.

**Interfaces:** `POST /api/projects/:id/jobs` con `{kind,payload}` crea trabajo en estado `queued`; `GET /api/projects/:id/jobs` lista trabajos. `POST /api/runner/jobs/claim` con token Bearer y `{kinds}` devuelve `{job,lease}` o `{job:null}`. `POST /api/runner/jobs/:id/renew` renueva la concesión vigente; `POST /api/runner/jobs/:id/complete` con `{lease,status,result}` finaliza solo concesión vigente; repetición exacta devuelve resultado ya registrado. `POST /api/projects/:id/jobs/:jobId/cancel` marca cancelado; el runner aún deberá implementar la propagación de cancelación al proceso. Autenticación deriva runner y propietario del token. En cada reclamación/listado se caducan concesiones antiguas del propietario a `interrupted`.

- [ ] Probar sesiones y runners de dos usuarios con Miniflare; concurrencia, tipos, caducidad, cancelación o revocación y resultado repetido.
- [ ] Ejecutar la prueba y verificar el fallo por ausencia de rutas.
- [ ] Implementar migración, autenticación y transiciones D1 atómicas; ejecutar pruebas.
- [ ] Actualizar README con limitaciones y ejecutar `pnpm run test:web-api` y `git diff --check`.

## Etapas posteriores

Conectar el bucle local de tareas, persistir sesiones y preguntas, ejecutar flujos reales de Pi con credenciales del usuario y migrar la interfaz y los stores. Este plan no cierra la épica.

### Task 2: Primer trabajo real en runner local

**Files:** Create `runner/work-loop.mjs`; modify `runner/cli.mjs`, `web-api/test/jobs.test.mjs`, `runner/README.md`.

**Interfaces:** `runOnce({server,token,handlers})` reclama únicamente los nombres registrados en `handlers`, renueva la concesión mientras ejecuta y entrega resultado/error a la API. `runner/cli.mjs run-once` ejecuta una iteración y registra `economic-offer.calculate` reutilizando `calculateOffer` de `client/electron/services/economicOfferService.cjs`. No expone tipos de IA hasta integrar el runtime y credenciales reales.

- [ ] Añadir prueba Miniflare que empareje una instancia CLI, cree una tarea de oferta económica y verifique el resultado existente desde la API tras `run-once`; comprobar que un tipo de IA no se reclame.
- [ ] Ejecutar la prueba y observar el fallo antes de implementar.
- [ ] Implementar el bucle, asegurar la caducidad y cancelación mediante renovación, y ejecutar las pruebas de cola y del servicio de cálculo.
- [ ] Documentar que quedan pendientes recuperación de entrega y Pi.

### Task 3: Operación continua local

**Files:** Modify `runner/cli.mjs`, `web-api/test/jobs.test.mjs`, `runner/README.md`.

**Interfaces:** `run` consulta tareas compatibles en intervalos, continúa cuando no hay trabajo y sale limpiamente con SIGINT/SIGTERM; credencial revocada detiene el proceso. Se admiten errores de conexión transitorios sin perder los trabajos pendientes en D1.

- [ ] Probar un proceso de runner que espera un trabajo, lo ejecuta y termina cuando recibe SIGTERM.
- [ ] Ejecutar la prueba antes de implementar y después verificar `pnpm run test:web-api`.
