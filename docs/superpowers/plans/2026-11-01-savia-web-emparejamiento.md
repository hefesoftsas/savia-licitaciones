# Emparejamiento de runner local — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vincular y revocar un runner local por usuario mediante credenciales de un solo uso y comprobar su conexión saliente.

**Architecture:** Una sesión web solicita un código aleatorio de vida corta; el runner lo canjea una vez y recibe una credencial aleatoria propia. D1 guarda solo los hashes y la propiedad del runner. La comprobación de estado usa la credencial de runner, no la sesión web. No se lanza ningún runner alojado.

**Tech Stack:** Workers, D1, Better Auth, Web Crypto, Miniflare.

**Spec:** `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Global Constraints

- No desplegar ni ejecutar runners alojados o inferencia de Cloudflare.
- No introducir proveedores de IA mientras no se concilien las políticas existentes.
- Métodos mutadores de sesión requieren el origen configurado; no guardar secretos en texto en D1 ni incluirlos en logs.
- D1 es la fuente de verdad de asociaciones; el runner inicia la comunicación de salida.

## Review Focus

- Códigos caducados, usados y no válidos no dan acceso.
- Una cuenta no puede listar o revocar runners ajenos.
- Un runner revocado no puede enviar un heartbeat.
- Los secretos no aparecen en el listado ni en D1.
- Dos canjes simultáneos de un código generan como máximo un runner.

### Task 1: Emparejamiento y revocación

**Files:** Create `web-api/src/runners.js`, `web-api/migrations/0003_runners.sql`, `web-api/test/runners.test.mjs`; modify `web-api/src/index.js`.

**Interfaces:** `POST /api/runner-pairings` (sesión) devuelve código y caducidad; `POST /api/runners/pair` (código de un uso, nombre) devuelve ID y token; `GET /api/runners` y `DELETE /api/runners/:id` requieren sesión propietaria; `POST /api/runners/heartbeat` requiere token Bearer y registra última conexión. El canje es atómico mediante `UPDATE ... RETURNING`.

- [ ] Probar en Miniflare identidad, canje, concurrencia, revocación y aislamiento; comprobar que no se guardan los secretos originales.
- [ ] Ejecutar la prueba y observar fallo antes de implementar.
- [ ] Implementar rutas y migración con la credencial y código almacenados solo como hashes.
- [ ] Ejecutar las pruebas de identidad y runner; verificar `git diff --check`.

### Task 2: Cliente runner local

**Files:** Create `runner/` con comandos y prueba local. Diseñar y documentar el almacenamiento y permisos de la credencial local antes de permitir trabajos.

**Interfaces:** Cliente hace canje y heartbeats salientes; una credencial revocada detiene los heartbeats y exige nuevo emparejamiento.

- [ ] Probar canje, reconexión y revocación contra el Worker local.
- [ ] Implementar y verificar sin ejecutar trabajos arbitrarios ni inferencia.

Las tareas distribuidas, archivos temporales, recuperación de trabajos y ejecución Pi requieren planes y pruebas posteriores; esta fase no entrega paridad de la épica.
