# Savia Conector

Aplicación para emparejar el equipo con Savia web sin terminal ni una instalación manual de Node. El usuario descarga el instalador, abre Conector, pega la dirección y el código generado en la web y mantiene la aplicación abierta mientras trabaja. Puede detenerlo o volver a iniciarlo desde la ventana. Cerrar mientras está funcionando pide confirmación; no se instala un servicio de inicio automático.

## Plataformas

- Windows x64: instalador NSIS `.exe` por usuario.
- macOS Apple Silicon: `.dmg` arm64.
- macOS Intel: `.dmg` x64.

Cada paquete incluye Electron, el runner y sus herramientas. El runner reutiliza el Node integrado en Electron mediante un proceso separado con `ELECTRON_RUN_AS_NODE=1`; no se distribuye otra copia de Node. `runner/runtime-dependencies.json` define las raíces necesarias: se conservan sus dependencias transitivas, opcionales y peers instalados, excluyendo paquetes exclusivos de la interfaz y mapas de depuración JS/CSS. El lockfile original sigue fijando las versiones y no cambia. El emparejamiento se conserva en `~/.savia/runner.json`, fuera de la aplicación, con los permisos privados del CLI. El código viaja por stdin, nunca por argumentos ni logs. La ventana solo recibe estado público. Reinstalar la aplicación no borra la conexión.

La ventana indica si el proceso está en marcha; el indicador en la web confirma la comunicación con el servidor. La conexión a proveedores y la ejecución completa de documentos no se validan con la prueba local.

## Construcción (mantenedores)

Preparar dependencias según `DEPENDENCY_POLICY.md` y el helper OpenXML para la plataforma de construcción. Usar rutas absolutas nuevas:

```sh
pnpm run build:runner --output /ruta/nueva/bundle --prepare-cache
pnpm run build:connector --bundle /ruta/nueva/bundle --output /ruta/nueva/paquete
# build:connector verifica automáticamente el paquete final
```

La construcción es nativa por arquitectura. `connector/build.mjs` no publica. El workflow manual `connector.yml` genera artefactos de revisión en Windows y las dos arquitecturas de Mac; tampoco crea releases ni modifica Cloudflare. Sus etiquetas de máquina corresponden al [catálogo de runners de GitHub](https://github.com/actions/runner-images).

Pruebas del controlador: `pnpm run test:connector`. `smoke.mjs` utiliza el runtime y CLI distribuidos, una configuración temporal y un servidor local sin tareas ni inferencia: verifica emparejamiento, consulta de tareas y detención. No usa la cuenta real. `verify-documents.mjs` también comprueba procesamiento de imágenes y generación/lectura de Word, Excel y PDF con las dependencias del paquete final.

Para comprobar compatibilidad de una actualización, `smoke.mjs` acepta además `--replacement-bundle /ruta/al/nuevo/runner-bundle --replacement-node /ruta/al/nuevo/ejecutable`, junto con los argumentos de la versión anterior y `--electron-runtime`. Empareja la versión anterior con un servidor de prueba, la detiene y comprueba que la nueva versión consulta tareas usando exactamente el mismo archivo de conexión temporal. Esta prueba no instala el paquete ni sustituye la validación del instalador gráfico y la firma del sistema operativo.

El workflow también ejecuta `node connector/verify-installer.mjs --installer /ruta/al/instalador`. En macOS monta el DMG de solo lectura y copia la aplicación a una carpeta temporal; en Windows instala y desinstala silenciosamente en una carpeta temporal de CI. A continuación verifica conexión, documentos y OCR con la copia instalada. La instalación silenciosa de Windows se limita a CI porque NSIS también modifica accesos directos y registro del usuario. Esta comprobación no verifica la experiencia gráfica ni la firma o notarización.

## Descargas web

Configurar URLs HTTPS solo después de validar y publicar los artefactos:

- `RUNNER_DOWNLOAD_WINDOWS_URL`
- `RUNNER_DOWNLOAD_MACOS_ARM64_URL`
- `RUNNER_DOWNLOAD_MACOS_X64_URL`

`RUNNER_DOWNLOAD_MACOS_URL` se conserva como alternativa para un enlace común compatible con ambas arquitecturas. No configurarlo con un paquete exclusivo de una arquitectura. Sin URL, la web indica que el instalador aún no está disponible.

## Estado de distribución

Los paquetes actuales no tienen firma de editor Windows ni notarización Apple. No desactivar protecciones del sistema para instalarlos. La entrega pública sin fricción requiere firma y notarización, además de probar instalación, conexión y desinstalación en cada sistema. El workflow preparado no demuestra por sí solo que Windows o Mac Intel hayan pasado esas pruebas.

El conector todavía no busca ni instala actualizaciones automáticamente. Una versión nueva requiere distribuir y abrir el instalador correspondiente al equipo; antes de reemplazar la aplicación, detén el conector y espera a que termine cualquier tarea. El emparejamiento se guarda fuera del paquete, pero la actualización sobre una instalación existente debe verificarse en cada plataforma antes de ofrecerla como flujo de producción.

### Descarga en vista previa local

Para probar un instalador ya generado sin publicarlo, ejecutar `node connector/serve-installer.mjs --file /ruta/absoluta/Savia-Conector-0.1.0-mac-arm64.dmg`. Sirve únicamente ese archivo en `127.0.0.1:8789`. Configurar `RUNNER_DOWNLOAD_MACOS_ARM64_URL` con la URL que imprime y reiniciar la vista previa con ese archivo de variables. Las URLs HTTP de loopback se admiten solo cuando la propia API se consulta por HTTP de loopback; en producción se siguen exigiendo URLs HTTPS. El servidor local debe permanecer abierto durante la descarga.
