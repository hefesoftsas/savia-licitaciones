# Savia web: identidad y entorno local — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establecer una API web aislada que use Better Auth con D1 y que pueda autenticarse y probarse íntegramente en Miniflare, como base de la aplicación y del emparejamiento posterior del runner.

**Architecture:** Un nuevo Worker sirve `/api/auth/*` con Better Auth y limita las operaciones de negocio a sesiones autenticadas. D1 es la fuente de verdad de usuarios y sesiones; las pruebas arrancan el Worker compilado en Miniflare con D1 local y secretos de prueba. Esta fase no incluye runner alojado, inferencia ni despliegue.

**Tech Stack:** Node 22, pnpm 11, Cloudflare Workers, Wrangler, Miniflare, D1, Better Auth.

**Spec:** `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Global Constraints

- No aprovisionar ni desplegar recursos remotos ni habilitar ejecución alojada.
- No agregar bindings de Workers AI, AI Search ni inferencia de Cloudflare.
- La instalación y cualquier dependencia nueva deben satisfacer `DEPENDENCY_POLICY.md`, con scripts automáticos deshabilitados y versiones de al menos 48 horas.
- No guardar credenciales reales en archivos del repositorio ni usar almacenamiento del navegador como fuente de verdad.
- La API debe verificar identidad y aislamiento en su frontera de red. No exponer servicios IPC de escritorio sin adaptación.
- Los cambios sin confirmar del checkout original no forman parte de la base; inventariarlos antes de declarar paridad.

## Review Focus

- Sin sesión, las rutas privadas niegan acceso y no revelan datos.
- Una sesión invalidada no vuelve a acceder a rutas privadas.
- Usuario A no recibe información de usuario B; la identidad se deriva de sesión, no de parámetros de cliente.
- El esquema y los datos de autenticación sobreviven el reinicio del runtime local cuando la persistencia se configura.
- La configuración local de pruebas no crea recursos alojados ni habilita servicios de inferencia.

### Task 1: Inventario y entorno

**Files:** Create `docs/superpowers/plans/2026-11-01-savia-web-inventario.md`.

**Interfaces:** Consumes el árbol `client/` y la especificación; produces una tabla de subsistemas, límites de migración y verificaciones pendientes.

- [ ] Documentar los flujos, bases y dependencias nativas detectados; incluir estado desconectado de las funciones remotas y diferencias del checkout original.
- [ ] Ejecutar el instalador verificado, `pnpm run setup:client`, `pnpm run build` y `pnpm run smoke:electron-native` desde `client/`; registrar resultados reales y fallos previos.

### Task 2: Worker de identidad probado localmente

**Files:** Create `web-api/package.json`, `web-api/wrangler.jsonc`, `web-api/src/index.js`, `web-api/src/auth.js`, `web-api/migrations/0001_auth.sql`, `web-api/test/auth.test.mjs`. Modify `pnpm-workspace.yaml`, `pnpm-lock.yaml` y comandos raíz cuando corresponda.

**Interfaces:** `GET/POST /api/auth/*` implementados por Better Auth; `GET /api/me` requiere sesión y responde solo con identidad del usuario autenticado. Las tablas de Better Auth viven en el binding D1 `DB`; `BETTER_AUTH_SECRET` y URL provienen del entorno, no de código ni del repositorio.

- [ ] Añadir la prueba de integración real en Miniflare que registre e identifique un usuario, deniegue `/api/me` sin sesión y tras cerrar sesión, y confirme aislamiento entre dos sesiones.
- [ ] Ejecutar la prueba y verificar que falla por faltar la implementación.
- [ ] Implementar el Worker, la migración de Better Auth y configuración local D1 sin bindings de inferencia ni ruta de despliegue automático.
- [ ] Ejecutar la prueba con Miniflare local, el build del cliente y `npm audit` para la modificación de dependencias; registrar resultados y revisar la configuración Wrangler completa.

### Task 3: Persistencia de sesiones y límites

**Files:** Modify `web-api/test/auth.test.mjs` y la configuración local según necesidad.

**Interfaces:** Las mismas rutas de Task 2; la persistencia local D1 se activa expresamente solo en el harness de pruebas.

- [ ] Probar que el mismo almacén D1 persiste sesiones entre instancias del runtime, y que cookies expiradas o sesión revocada no obtienen identidad.
- [ ] Corregir los problemas detectados y volver a ejecutar pruebas de identidad y compilación.

## Etapas posteriores fuera de este plan

El runner local, la cola durable, credenciales cifradas, migración de los datos, puente web y paridad de funciones requieren planes y pruebas propios. Esta fase no representa la finalización de la épica.
