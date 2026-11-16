# Consulta de licitación mediante Pi local — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el primer flujo de consulta de licitación de escritorio con la cola web y el runtime real Pi en el runner local.

**Architecture:** El handler autorizado obtiene credenciales y documentos de la concesión, admite texto UTF-8, PDF con texto seleccionable y DOCX mediante el parser local, crea un directorio temporal aislado y utiliza `createTenderChatService`, `createPiRuntimeService` y `createAiService` existentes. El runtime consulta OpenCode Go usando la credencial del cliente. Una prueba usa Pi y el proxy reales con un modelo simulado local, sin llamadas de inferencia reales. Los datos del resultado regresan a la cola y el workspace temporal se borra.

**Tech Stack:** Node 22, Pi SDK y servicios existentes de Electron, OpenCode Go, Workers, D1/R2 emulados mediante Miniflare.

**Spec:** `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Global Constraints

- Solo OpenCode Go para esta integración, siguiendo AGENTS.md; ninguna inferencia de Cloudflare ni nuevo uso de OpenRouter.
- No imprimir ni persistir credenciales en archivos temporales ni logs. No exponer texto de error del proveedor en resultados.
- No activar ni desplegar runners alojados; no enviar documentos a proveedores en pruebas automatizadas.
- El handler informa explícitamente de formatos no admitidos y aún no promete continuidad de conversación ni paridad completa.
- Mantener la cancelación de la concesión mediante `AbortSignal`, herramientas de lectura y directorio temporal aislado.

## Review Focus

- Archivos no seleccionados, binarios y UTF-8 inválido no se tratan como texto válido.
- El agente Pi real lee el documento con una herramienta y el resultado vuelve a la cola sin clave.
- Una tarea cancelada recibe señal de interrupción y sus temporales se eliminan.
- No se reclama una tarea de IA si el runner no tiene los requisitos del runtime local.
- Las credenciales y contenido sensible no aparecen en logs de depuración ni quedan en el directorio temporal.

### Task 1: Entregar contenido con tipo al handler

**Files:** Modify `runner/work-loop.mjs` and `web-api/test/credentials.test.mjs`.

**Interfaces:** `context.getFileInfo(fileId)` devuelve `{bytes: ArrayBuffer, contentType: string}`; `getFile` mantiene compatibilidad.

- [ ] Añadir prueba de tipo y bytes contra Miniflare, verificar fallo y luego implementar.

### Task 2: Handler con Pi real y proveedor simulado en pruebas

**Files:** Create `runner/tender-chat.mjs`, `runner/test/tender-chat.test.mjs`; modify `runner/cli.mjs`, `runner/README.md`.

**Interfaces:** `createTenderChatHandler({createAiService?})` produce handler `(payload, context)`. Payload contiene `question`, `fileIds`, `language`. Resultado `{answer,followUps}`. El servicio de modelo inyectable se usa solo en pruebas; por defecto usa `createAiService` y el endpoint OpenCode Go del código existente.

- [ ] Probar con Pi, proxy y herramientas reales; el proveedor simulado responde con una llamada a `read` y verifica el contenido observado en la segunda interacción. No conectar proveedores externos.
- [ ] Probar fallo de texto inválido y limpieza temporal; ejecutar primero con fallo y después implementar.
- [ ] Registrar el handler en el runner, ejecutar las pruebas y `node scripts/verify-agent-tools.cjs` desde `client/`.

## Etapas posteriores

Adaptar formatos adicionales, OCR y el historial persistente del chat; conectar interfaz web, progreso, cancelación interactiva y demás funciones de la aplicación. Esta entrega parcial no cierra la épica.
