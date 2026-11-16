# Política de dependencias

El monorepo usa pnpm 11.24.0 y Node 22.13 o posterior. `pnpm-workspace.yaml` exige una antigüedad mínima de **2880 minutos (48 horas)** y desactiva scripts automáticos de instalación (`ignoreScripts: true`) y los scripts `pre`/`post` asociados a otros comandos (`enablePrePostScripts: false`). Los comandos que se ejecutan expresamente con `pnpm run` siguen disponibles.

Para instalar desde la raíz:

```sh
node scripts/install-dependencies.mjs
```

Este comando lee el lockfile de pnpm, verifica en el registro la fecha de las dependencias directas y transitivas y, solo si todas cumplen el plazo, ejecuta una instalación congelada sin scripts (`pnpm install --frozen-lockfile --ignore-scripts`). Si falta información o no hay conexión, se detiene. Para archivos ajenos al registro, solo admite las URL e integridades concretas de [better-sqlite3 v12.12.0](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.12.0) y [SheetJS v0.20.3](https://docs.sheetjs.com/docs/miscellany/contributing/), con fechas de publicación verificadas. Cualquier otra fuente sin evidencia queda bloqueada. CI utiliza el mismo instalador; `--no-optional` omite dependencias opcionales en la instalación, pero no en la comprobación del lockfile.

Los parches declarados en `patchedDependencies` (`pnpm-workspace.yaml`) los aplica pnpm al instalar, sin ejecutar scripts de paquetes. Verifica después la compilación web desde `client/` con `pnpm run build` o desde la raíz con `pnpm run build:web` y `pnpm run test:web-assets`.

Las configuraciones pueden modificarse por quien controle el entorno y no protegen contra una desactivación deliberada. Para instalar nuevas dependencias, usa pnpm con la configuración del workspace y actualiza el lockfile; ejecuta el instalador verificado antes de usar o distribuir el resultado.

## Corrección temporal de Joi

`client/patches/joi+18.3.0.patch` incorpora la corrección de CVE-2026-118772 a la versión fijada. La prueba `node --test client/scripts/tests/joi-regression.test.cjs` comprueba el caso de bloqueo. La auditoría puede seguir mostrando el aviso porque identifica la versión publicada y no el parche local. La versión oficial 18.3.1 ya cumple el mínimo de 48 horas; se sustituirá el parche cuando se actualice y se verifique el conjunto de dependencias.
