# Chat de licitación: plan de implementación

> **Ejecución:** implementar en esta sesión, por tareas, con pruebas dirigidas y verificación de integración.

**Objetivo:** conversar con los documentos importados del proyecto mediante Pi y el modelo OpenCode Go configurado.

**Arquitectura:** conversación propia por proyecto y persistencia en SQLite, con operaciones y sesión Pi gestionadas por Main. La tabla `tender_chat_messages` queda fuera de las instantáneas `technical_plan_*` para mantener compatibilidad con proyectos previos. El agente consulta copias identificadas de las fuentes mediante herramientas y devuelve referencias; React consume el estado mediante IPC y un adaptador de assistant-ui.

**Tecnología:** Electron, React, TypeScript, SQLite, Pi existente y `@assistant-ui/react` si su integración es viable.

**Diseño:** `docs/superpowers/specs/2026-10-30-chat-licitacion-design.md`.

## Restricciones

- Por indicación del usuario para este proyecto, usar el modelo de OpenCode Go ya configurado; conservar su configuración y cualquier límite `max_price` existente. No usar inferencia ni embeddings locales.
- Los textos visibles estarán en español e inglés; los mensajes del agente se renderizan sin HTML crudo.
- Los documentos originales no se modifican; la fuente y la conversación pertenecen al proyecto activo.
- No se usa GPU, almacenamiento del navegador para datos de negocio ni índice vectorial en esta primera versión.

## Riesgos que hay que verificar

- Cambio de proyecto mientras el agente responde: el resultado no puede aparecer en el otro proyecto.
- Documentos eliminados o reemplazados: la siguiente consulta debe usar la lista actual.
- Interrupción o reinicio: conservar mensajes confirmados y mostrar claramente una solicitud incompleta.
- Documentos grandes o sin paginación: no truncar en silencio ni inventar páginas; evaluar fuentes y límites reales.
- Error o cancelación del agente: evitar respuestas incompletas presentadas como definitivas.

## Tareas

### 1. Contratos y almacenamiento

**Archivos:** crear servicio y pruebas de chat en `client/electron/services/`; modificar `sqliteDatabase.cjs` y `sql/workspace_schema.sql` si es necesario, y registrar las operaciones IPC/preload y tipos correspondientes.

- [x] Escribir pruebas que fallen para guardar y recuperar mensajes por proyecto, aislar proyectos y mantener estado interrumpido.
- [x] Implementar persistencia e IPC con pruebas pasando; incluir migración y smoke test nativo.

### 2. Agente y fuentes

**Archivos:** servicio de chat y pruebas en `client/electron/services/`; reutilizar `agentService.cjs` y `technicalPlanStore.cjs`.

- [x] Probar con agente simulado que cada solicitud recibe las fuentes actuales con nombres identificables, que la conversación mantiene contexto y que la cancelación o cambio de proyecto no cruza resultados.
- [x] Crear una sesión persistente independiente por proyecto, sin modificar documentos originales; usar herramientas de lectura y búsqueda disponibles y mostrar estado de ejecución.
- [x] Probar error, falta de documentos y documentos cambiados. Evitar generar referencias de página inexistentes.

### 3. Interfaz

**Archivos:** componentes y hooks en `client/src/features/technical-plan/`, puntos de entrada existentes, tipos de bridge y estilos asociados.

- [x] Evaluar y agregar `@assistant-ui/react` con adaptador externo si encaja con las restricciones; documentar la decisión y auditar dependencias.
- [x] Implementar mensajes, envío, progreso, cancelación, recuperación y fuentes en es/en usando los componentes y temas actuales.
- [ ] Completar revisión manual de foco, desplazamiento y estados en varios tamaños y temas; la prueba automatizada de Electron ya cubre 1440×900 y 1040×720.

### 4. Verificación integral

- [x] Ejecutar `node --check` de los Main/preload modificados, pruebas dirigidas, `npm run build`, `npm run smoke:electron-native` y `npm audit` si se agregan dependencias.
- [ ] Probar el ciclo completo con documentos de ejemplo y agente simulado. Cuando haya credenciales y modelo elegible, medir recuperación y atribución con documentos de varios tamaños; registrar claramente cualquier prueba real pendiente.
- [ ] Revisar el diff y documentar los límites, las decisiones y los resultados sin afirmar que RAG es innecesario para todos los tamaños.

## Estado de la evaluación

El proyecto ya contiene un prototipo funcional con una interfaz basada en `@assistant-ui/react` y persistencia local por proyecto. Las pruebas incluyen el ciclo de Pi real con un proveedor simulado: lectura y búsqueda al final de un documento de 4.000 líneas, seguimiento de sesión y renovación al cambiar fuentes. La elección de herramientas está simulada. También se comprobó la búsqueda con un PATH sin rg ni fd del sistema, usando los binarios incluidos y sin descargas automáticas. No miden la calidad del modelo ni la cobertura de la búsqueda. La prueba con Pi y OpenCode Go, y la decisión definitiva sobre la necesidad de RAG, se evalúan con el modelo de texto y la clave ya configurados por el usuario. `cd client && ./node_modules/.bin/electron scripts/check-tender-chat-real-eval.cjs` importa dos documentos sintéticos, ejecuta cuatro preguntas independientes y una de seguimiento, y muestra respuestas, tiempo, número de solicitudes y tokens cuando el proveedor los reporta. Las referencias y la respuesta de ausencia requieren revisión humana; con un `max_price` configurado que esta ruta no pueda verificar, la evaluación se detiene antes de llamar al modelo. `npm run dev` no arrancó porque el puerto obligatorio 5173 estaba ocupado; se verificó el flujo aislado con Vite en el puerto 5174 y Electron.


## Evaluación con el modelo configurado

El 30 de octubre de 2026 se ejecutó la evaluación sintética con OpenCode Go y Pi: cinco respuestas correctas en lectura del pliego, adenda de 4.000 líneas, comparación, seguimiento y ausencia; cada una identificó las fuentes pertinentes. Los tiempos fueron 7,18; 19,54; 10,82; 6,48 y 7,43 segundos, respectivamente. La pregunta de la adenda acumuló 97.408 tokens de entrada y 1.321 de salida en siete solicitudes. Estos resultados no representan expedientes reales ni prueban exhaustividad: empezar sin índice vectorial es viable para este caso, pero se deben medir cobertura, tiempos y consumo con expedientes reales antes de decidir si hace falta recuperación indexada.
