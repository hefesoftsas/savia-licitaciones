# Exportación web de la matriz de requisitos

- Ampliar `web-api/test/workflow.test.mjs` antes de implementar: los archivos CSV y XLSX deben contener la instantánea guardada, admitir es/en y respetar la propiedad del proyecto; comprobar también formato inválido y matriz vacía.
- En `web-api/src/workflow.js`, consultar los requisitos y datos SECOP del proyecto autorizado y llamar al formateador del escritorio. En `index.js`, enrutar la descarga autenticada sin confundir `export` con un ID de requisito.
- En `WebWorkflow.tsx`, ofrecer ambos formatos y comunicar que se exportan cambios guardados; conservar el estado de la edición y manejar fallos de descarga.
- Verificar la prueba específica en Miniflare, las pruebas del formateador existente y la compilación web/de escritorio. La comparación RUP no implementada sigue vacía: no se inventan datos.
