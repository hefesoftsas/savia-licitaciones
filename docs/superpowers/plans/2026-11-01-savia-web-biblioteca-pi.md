# Análisis de biblioteca con Pi

**Objetivo:** procesar un documento de la biblioteca con Pi en el runner local, presentar entradas con citas verificables y permitir que el usuario las acepte y busque.

**Arquitectura:** tarea de cuenta `knowledge.analyze` en la cola durable; concesión autoriza únicamente el documento y la credencial seleccionados. El runner extrae texto localmente y Pi propone títulos, resúmenes y citas literales; solo se conservan citas presentes en el texto. Resultados quedan pendientes hasta aceptación, que sustituye el índice anterior con control de revisión en D1. Al borrar el documento se retiran sus entradas. Sin cómputo alojado.

**Tecnologías:** Pi, parser local, Better Auth, Worker, D1, R2, React, Miniflare.

**Diseño:** `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Requisitos
- Solicitar autorización explícita ligada a documento y credencial; proteger aislamiento y concesiones.
- Sin proveedores adicionales, Workers AI, AI Search ni llamadas reales de inferencia en pruebas.
- No inventar citas: validar contra el texto íntegro; rechazar documentos excesivos sin recortarlos silenciosamente.
- Aceptación con revisión optimista y documento aún disponible; análisis interrumpidos no modifican el índice.
- Búsqueda por contenido de entradas aceptadas, título, resumen y nombre; mostrar fuente original y exigir revisión del usuario.

## Tareas
1. Probar en Miniflare creación, consentimiento, idempotencia, aislamiento, acceso por concesión, aceptación, búsqueda y borrado; implementar API y cola.
2. Probar handler del runner: parser, consentimiento, citas verificables, rechazo de citas inexistentes y limpieza; implementar Pi y registrar capacidad y distribución.
3. Añadir selección de modelo, autorización y revisión de propuestas a la biblioteca; permitir buscar entradas aceptadas.
4. Ejecutar pruebas de API y runner, compilaciones, revisión de rutas de distribución y pruebas locales sin proveedor remoto.
