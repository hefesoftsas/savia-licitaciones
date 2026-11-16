# Credenciales de proveedor y acceso del runner — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar credenciales de IA del cliente cifradas en D1 y entregarlas exclusivamente a un runner autorizado para el trabajo que las seleccionó.

**Architecture:** El servidor usa AES-256-GCM con IV aleatorio y datos asociados que ligan identidad, credencial y proveedor. La clave se carga desde un secreto externo, con identificador de versión; sin configuración válida la operación falla cerrada. El servidor expone metadatos a la sesión y descifra exclusivamente para la concesión vigente asociada al trabajo. No se añaden rutas de inferencia.

**Tech Stack:** Cloudflare Workers, Web Crypto, D1, Better Auth, Miniflare.

**Spec:** `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Global Constraints

- Nunca almacenar claves en texto, URL, payload del trabajo, logs o configuración Wrangler; el secreto de cifrado se configura externamente.
- La selección y activación de proveedores sigue sujeta a políticas del proyecto y términos. No activar OpenRouter ni inferencia de Cloudflare.
- El runner solo recibe una credencial elegida explícitamente en su trabajo y perteneciente al mismo usuario, con concesión vigente.
- No desplegar recursos ni activar runner alojado.

## Review Focus

- Dos cuentas no pueden leer ni seleccionar las credenciales de la otra.
- Un runner no puede obtener una credencial si el trabajo es ajeno, no está en ejecución, se canceló, caducó o no la seleccionó.
- El texto original no aparece en D1, respuesta de lista ni payload de la cola.
- La falta o cambio de clave de cifrado detiene la operación sin usar valores por defecto.
- La revocación de credencial impide obtenerla para solicitudes posteriores.

### Task 1: Almacenamiento y recuperación por concesión

**Files:** Create `web-api/src/credentials.js`, `web-api/migrations/0005_credentials.sql`, `web-api/test/credentials.test.mjs`; modify `web-api/src/index.js`, `web-api/src/jobs.js`, `web-api/README.md`.

**Interfaces:** `POST /api/provider-credentials` con `{provider,model,secret}` devuelve metadatos y `GET` los lista; `DELETE /api/provider-credentials/:id` revoca. El trabajo selecciona `{credentialId}` en un campo separado del payload. `POST /api/runner/jobs/:id/credential` acepta `{lease}` y devuelve solo la credencial seleccionada si el runner y la concesión están vigentes. D1 guarda `key_id`, IV y texto cifrado autenticado. Variables externas `CREDENTIAL_KEY_HEX` y `CREDENTIAL_KEY_ID`.

- [ ] Probar con Miniflare dos usuarios, cancelación, revocación, vencimiento, clave equivocada, integridad del cifrado y ausencia de secretos en la base y listados.
- [ ] Ejecutar las pruebas y verificar que fallan antes de implementar.
- [ ] Implementar y repetir pruebas, manteniendo fail-closed y sin configurar secretos en Wrangler.
- [ ] Documentar la configuración local y la necesidad de estrategia de rotación y recuperación previa a producción.

### Task 2: Uso desde Pi

La integración de Pi con servicios y documentos del runner se aborda por separado después de esta base; esta fase no realiza inferencia ni modifica la política de proveedores.

### Task 2: Documentos seleccionados por tarea

**Files:** Modify `web-api/src/credentials.js`, `web-api/src/index.js`, `web-api/test/credentials.test.mjs`, `web-api/README.md`.

**Interfaces:** `POST /api/runner/jobs/:id/files/:fileId` recibe `{lease}`. Solo devuelve el binario si el archivo pertenece al proyecto del trabajo, su ID consta en `payload.fileIds`, la concesión está vigente y pertenece al runner autenticado. No devuelve archivos de otros proyectos ni documentos no seleccionados.

- [ ] Probar descarga de archivo seleccionado y rechazo para runner, archivo y concesión incorrectos o cancelados.
- [ ] Ejecutar la prueba antes de implementar y observar el fallo.
- [ ] Implementar la lectura de R2 con autorización por sesión de runner y probar de nuevo.

### Task 3: Contexto de acceso desde el runner

**Files:** Modify `runner/work-loop.mjs`, `web-api/test/credentials.test.mjs`.

**Interfaces:** El contexto entregado a cada manejador expone `getCredential()` y `getFile(fileId)`; ambos usan la concesión de la tarea y respetan cancelación. Los secretos no se agregan al resultado ni a registros.

- [ ] Probar un manejador de prueba que obtiene la credencial y el documento autorizado desde el Worker local y termina sin devolver la clave.
- [ ] Ejecutar antes de implementar; implementar los métodos y repetir toda la suite.
