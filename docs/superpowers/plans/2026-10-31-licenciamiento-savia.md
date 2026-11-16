# Licenciamiento Savia Implementation Plan

> **For agentic workers:** Execute task by task; verify security properties with failing tests first.

**Goal:** Activar Savia mediante claves revocables, como máximo tres equipos activos y tres días sin conexión, con mensaje claro al alcanzar el límite.

**Architecture:** Servicio de licencias independiente con estado transaccional y autorizaciones firmadas; Electron Main protege claves y comprueba el permiso. El cliente conserva documentos locales y no envía información de licitaciones.

**Tech Stack:** Electron 43, Node.js, Web Crypto, Cloudflare Workers y SQLite/D1 según pruebas, React.

**Spec:** `docs/superpowers/specs/2026-10-31-licenciamiento-savia-design.md`.

## Global Constraints

- Tres activaciones máximas; cada permiso desconectado ocupa cupo durante tres días hasta su liberación o vencimiento.
- La revocación recibida invalida inmediatamente; sin conexión no se puede garantizar revocación inmediata.
- No modificar ni desplegar el antiguo servicio remoto; no incluir secretos en repositorio, interfaz o logs.
- Conservar acceso a documentos y exportación, aislar modo de pruebas y respetar licencias históricas.

## Review Focus

- Peticiones concurrentes y repetidas nunca deben conceder más de tres cupos activos.
- Un desafío vencido o repetido no debe renovar ni liberar un cupo.
- Respuestas tardías no deben reactivar un permiso revocado; el modo sin red no acepta respuestas no autenticadas.
- Reloj manipulado, reinstalación, almacén seguro inaccesible y pérdida de dispositivo deben explicarse sin pérdida de datos.
- Las rutas protegidas en Main no deben poder invocarse mediante IPC saltándose la pantalla; diagnósticos y exportación permanecen accesibles.

### Task 1: Contrato y servidor transaccional

**Files:** `licensing/` (servicio independiente, migración y pruebas). **Interfaces:** crear clave, activar, renovar, liberar y revocar; desafíos con expiración y consumo único; permisos firmados limitados a 72 horas o a la vigencia comercial.

- [ ] Escribir y ejecutar pruebas fallidas de firma, vencimiento, cuarta activación, reserva offline, peticiones concurrentes, replay y revocación.
- [ ] Implementar persistencia transaccional y endpoint autenticado, incluyendo emisión administrativa y secretos fuera del código; volver a ejecutar las pruebas.
- [ ] Documentar despliegue, rotación y recuperación sin credenciales ni cambios remotos.

### Task 2: Cliente y control de permisos

**Files:** `client/electron/services/`, `client/electron/ipc/`, `client/electron/preload.cjs`, `client/src/shared/types/ipc.ts`. **Interfaces:** activar, renovar, liberar, estado y verificación por operación; almacenamiento seguro del dispositivo.

- [ ] Probar fallo ante firma inválida, límites, expiración a 72 horas, reconexión, manipulación de reloj, revocación y respuesta tardía, almacén seguro inaccesible y migración histórica.
- [ ] Implementar comunicación, firma de desafíos, estado offline y control central en Main; preservar diagnóstico y exportaciones.
- [ ] Comprobar IPC real y recuperación de documentos con base aislada y claves de prueba.

### Task 3: Interfaz y validación integral

**Files:** `client/src/features/settings/`, `client/src/app/LicenseStatusPrompt.tsx`, traducciones y pruebas de interfaz.

- [ ] Probar activación, cuarto equipo, liberación, cuenta regresiva, sin conexión y mensajes en español e inglés.
- [ ] Implementar interfaz accesible y adaptable, sin mostrar o registrar claves completas.
- [ ] Ejecutar pruebas dirigidas, `npm run build`, verificaciones de Electron y cliente-servidor local; verificar empaquetado en plataformas disponibles y documentar las que falten.
