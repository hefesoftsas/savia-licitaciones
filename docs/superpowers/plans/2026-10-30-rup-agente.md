# Análisis del RUP con Pi

**Objetivo:** sugerir datos del certificado RUP mediante el agente Pi y el modelo OpenCode Go configurado, conservando fuentes para revisión humana.

**Diseño:** el servicio local extrae texto por página, entrega los archivos al agente de solo lectura y solicita datos con transcripción y página. El programa descarta referencias sin respaldo textual; la interfaz muestra sugerencias, vista de página y formulario editable antes de guardar. El usuario inicia el análisis y se informa que el texto consultado puede enviarse a OpenCode Go.

**Límites:** sin OCR, sin garantía de cobertura ni verificación ante la cámara; las páginas sin texto se informan. Un resultado nunca se guarda ni se usa como dato confirmado automáticamente. Detectar cambio de certificado durante el análisis y rechazar resultados desactualizados.

1. [x] Probar el servicio con respuestas válidas, referencias inventadas, configuración ausente, documentos escaneados y cambios de certificado.
2. [x] Conectar el servicio al agente existente, IPC y panel del certificado, manteniendo la extracción local y la revisión actual.
3. [x] Verificar compilación, pruebas enfocadas y el flujo Electron con datos sintéticos, sin enviar documentos privados al proveedor. La ejecución real del agente encontró el indicador esperado en el certificado sintético; las pruebas de interfaz con respuesta simulada pasaron en español e inglés sin GPU.
