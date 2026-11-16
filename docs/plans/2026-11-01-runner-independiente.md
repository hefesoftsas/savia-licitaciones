# Runner independiente

- El modo headless no debe cargar Electron ni activar sus instaladores al iniciar Pi o el parser local.
- Mantener intacto el comportamiento del escritorio y verificar Pi con proveedor simulado, documentos locales y Electron ausente.
- Preparar una distribución autocontenida basada en el lockfile y en las herramientas verificadas; probarla fuera del checkout antes de anunciarla como instalable.
- No publicar artefactos ni activar servicios alojados. La distribución sigue siendo preliminar hasta verificar Windows y macOS.
