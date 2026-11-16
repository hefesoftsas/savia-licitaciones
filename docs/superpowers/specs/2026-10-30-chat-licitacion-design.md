# Chat con documentos de la licitación

## Objetivo

Permitir conversar en español o inglés sobre los documentos importados del proyecto técnico activo, con respuestas fundamentadas en las fuentes. El chat usa el agente Pi existente y el modelo configurado en OpenCode Go; no requiere GPU local.

## Alternativas y decisión

1. Pi con herramientas de lectura y búsqueda sobre los Markdown ya importados: aprovecha la infraestructura existente y no necesita indexación ni modelos adicionales. Es la primera opción, sujeta a pruebas con documentos pequeños y grandes.
2. Enviar todos los documentos en cada pregunta: simple, pero puede superar la ventana de contexto y encarecer las conversaciones; no se adopta como estrategia general.
3. RAG vectorial: requiere embeddings compatibles con el proveedor y el límite de precio existentes, indexación y evaluación. Se pospone salvo que la búsqueda con herramientas muestre problemas medibles de calidad, latencia o costo. La ausencia de GPU no impide RAG, pero no justifica añadirlo por sí sola.

Para la interfaz, evaluar `@assistant-ui/react` con `ExternalStoreRuntime`, componentes existentes y estilos del producto. El paquete MIT admite un backend propio; no usar servicios alojados, telemetría ni inferencia del paquete. Si resulta incompatible o impone servicios adicionales, documentar la evidencia y usar componentes locales existentes.

## Comportamiento

- Acceso desde el espacio de la propuesta técnica y contexto limitado al proyecto activo y sus documentos importados.
- Conversación persistente por proyecto; conservar mensajes al volver o reiniciar y evitar mezclarlos al cambiar de proyecto. Se puede iniciar una conversación nueva sin alterar los documentos originales.
- Preguntar en lenguaje natural; mostrar respuesta Markdown segura, progreso, error recuperable y cancelar. En ausencia de documentos o configuración de modelo, explicar qué falta.
- El agente consulta copias de fuentes identificadas, nunca modifica los documentos originales; identifica el nombre del documento y la sección o referencia disponible. No inventa página ni fuente y reconoce cuando no encuentra información. La importación existente no garantiza conservar páginas originales.
- Si se agregan, cambian o eliminan fuentes, el agente usa la lista actual en la siguiente consulta; no reutilizar respuestas antiguas como evidencia de documentos actuales.
- Las operaciones largas y su estado viven en Main; el Renderer se comunica por preload/IPC. Estado estructurado en SQLite, no en almacenamiento del navegador. Evitar acoplarse a sesiones de generación de propuestas.

## Comprobación de viabilidad

Ejecutar pruebas reproducibles con varias fuentes de distinto tamaño y preguntas de localización, síntesis entre archivos, ausencia de información y conversación de seguimiento; medir aciertos, trazabilidad, latencia y consumo cuando haya credenciales y modelo configurado. Las pruebas deterministas con agentes simulados verifican aislamiento, persistencia y cancelación, pero no demuestran calidad del modelo. Sin credenciales no inventar resultados ni habilitar proveedores alternativos.
