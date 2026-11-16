# Biblioteca documental web: implementación inicial

**Objetivo:** permitir que cada cuenta organice y recupere sus documentos de conocimiento en la nube, conservando el camino hacia extracción y búsqueda de entradas con Pi.

**Arquitectura:** carpetas y metadatos en D1, originales en R2. API de sesión con aislamiento por propietario, comprobación de origen en escrituras y limpieza de objetos; interfaz de biblioteca en la navegación existente. La carga no ejecuta inferencia ni afirma que el archivo ya se haya procesado.

**Tecnologías:** Worker, Better Auth, D1, R2, React, Miniflare.

**Diseño:** `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Condiciones
- Ningún servicio de inferencia Cloudflare ni runner alojado; no se despliega.
- Los documentos y carpetas pertenecen a una cuenta; no confiar en IDs proporcionados por otra cuenta.
- Mantener originales y no simular entradas de conocimiento; extracción, migración y búsqueda de contenido son trabajo posterior.
- La eliminación de carpetas con documentos se rechaza para evitar pérdidas accidentales.

## Tareas
1. Prueba Miniflare: crear dos cuentas, carpetas y documentos; verificar aislamiento, búsqueda por nombre, descarga idéntica, rechazo de origen, eliminación y persistencia tras volver a consultar.
2. Migración D1 y API: agregar carpetas y documentos con claves R2 aleatorias; comprobar propietario en todas las operaciones; limpiar objeto si falla el registro; eliminar documento y prevenir eliminación de carpeta no vacía.
3. Interfaz en español e inglés: crear carpetas, seleccionar, subir, descargar, buscar por nombre y eliminar con confirmación; mostrar claramente que el análisis de contenido aún no está disponible.
4. Ejecutar prueba Miniflare, suite de API, compilaciones web y de escritorio y comprobar que no se añadió persistencia en el navegador.
