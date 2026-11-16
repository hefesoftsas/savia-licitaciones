# Diagnóstico local del runner

Implementar `node runner/cli.mjs doctor` como comprobación de solo lectura, sin acceder a la red ni mostrar credenciales. Informar la versión Node mínima, plataforma y arquitectura del manifiesto, disponibilidad y hashes de rg/fd/jq y OpenXML en una distribución, y estado de la configuración de emparejamiento. Si se ejecuta desde el checkout o con herramientas externas, advertir que no se puede validar la distribución completa. No afirmar que una comprobación de archivos pruebe compatibilidad operativa con Windows, macOS u otro proveedor.

1. Probar Node, plataforma, configuración ausente/incorrecta, archivos ausentes/alterados y salida sin secretos con fixtures locales.
2. Incorporar el comando y el módulo al paquete y documentar el uso y sus límites.
3. Verificar desde el checkout y un paquete aislado con la plataforma disponible; no desplegar ni ejecutar inferencia.
