# Mejoras competitivas de Savia — plan de implementación

**Objetivo:** Completar cinco mejoras en el escritorio manteniendo evidencia trazable y revisión humana.

**Arquitectura:** Los datos y tareas persistentes viven en Electron Main y SQLite; la interfaz usa IPC. SECOP y PAA se consultan con los datos abiertos oficiales. Pi usa OpenCode Go solo si una mejora precisa inferencia. Las tareas programadas funcionan mientras Savia está abierta.

**Condiciones:** No añadir proveedores de IA ni dependencias sin necesidad. Conservar los cambios existentes. No presentar resultados parciales como exhaustivos, ni inferencias como decisiones de elegibilidad. Mostrar fuente y fecha de consulta.

## 1. Seguimiento de licitaciones
- [x] Guardar una línea base independiente por proceso, con fecha de consulta y documentos. Primera consulta establece línea base sin alertas históricas falsas.
- [x] Consultar periódicamente y por demanda; detectar cambios de estado, fase, cierre y valor, y documentos nuevos. No actualizar línea base documental si la respuesta está incompleta; conservar errores y permitir reintentar.
- [x] Guardar avisos sin duplicados y permitir revisarlos desde la campana, con enlace al proceso. Probar reinicios, fallos, respuestas parciales y revisión.

Las consultas que estaban en curso se invalidan cuando se elimina una licitación. Las pruebas cubren errores tardíos, volver a agregar el mismo proceso y cambios mientras espera en la cola, además de detener la paginación documental cuando se retira el proceso.

## 2. Matriz de requisitos y RUP
- [x] Reutilizar requisitos existentes, sugerencias y comparaciones RUP; agrupar por categoría, estado y fuente sin convertir lo no comprobado en cumplimiento.
- [x] Mostrar soporte, página cuando exista, comparación guardada y necesidad de volver a revisar cuando cambien fuentes; probar cálculos y persistencia.

## 3. Agenda local
- [x] Integrar tareas existentes, cierres disponibles y vencimientos de credenciales en vista cronológica con origen explícito; diferenciar fechas personales de oficiales.
- [x] Añadir avisos locales, mostrar datos al abrir la app y no prometer avisos con la app cerrada; probar fechas y zonas horarias.

## 4. Radar PAA
- [x] Consultar el conjunto oficial SECOP II 9sue-ezhx, mapeando campos verificados; filtros y paginación con límites, enlace a la fuente, fecha de consulta y rótulo de compra planeada.
- [x] Añadir vista en la navegación y probar paginación, errores y valores vacíos con respuestas reales representativas.

## 5. Histórico
- [x] Consultar contratos públicos por entidad o proveedor mediante campos verificados; presentar valores, fechas y enlaces, sin pronósticos ni afirmaciones de probabilidad.
- [x] Añadir filtros, paginación y advertencia sobre cobertura; probar consultas, errores y fuentes.

## Verificación final
- [x] Probar cada servicio y el recorrido IPC/renderer, tamaños soportados, claro/oscuro y accesibilidad básica.
- [x] Comprobar migración SQLite y smoke nativo cuando corresponda; ejecutar compilación y revisar cambios.

## Precisión de fechas de recepción

Los [metadatos de SECOP II](https://www.datos.gov.co/api/views/p6dx-8zbt.json) distinguen la fecha de recepción de respuestas de las fechas de apertura estimada y efectiva. Savia ya no sustituye la primera por las otras. Tampoco presenta el fin de ejecución de SECOP I o de contratos como cierre de ofertas. Las fechas guardadas por versiones anteriores no se eliminan: se muestran como pendientes de verificar y no generan recordatorios hasta una nueva consulta con fecha de recepción identificada. Si la fuente no trae esa fecha, se conserva el dato anterior sin afirmar que sea el cierre.

## Moneda de los procesos

Los [metadatos de SECOP I](https://www.datos.gov.co/api/views/f789-7hwg.json) incluyen `moneda` y la consulta pública muestra monedas distintas del peso; los conjuntos de procesos y contratos SECOP II consultados no informan un campo de moneda. Savia muestra la moneda textual cuando está informada y, para datos sin procedencia verificable o guardados por versiones anteriores, indica que está sin verificar. Los filtros numéricos no hacen conversión de moneda. CSV y Excel añaden la moneda informada junto al valor; el agente solo recibe una moneda con procedencia verificada. También se conserva el indicador de procedencia del cierre al guardar una licitación.
