# Savia Licitaciones

Savia ayuda a organizar procesos de contratación, gestionar documentos de empresa y preparar propuestas. Es una aplicación web (`client/` + `web-api/`) apoyada por un ejecutor de tareas (`runner/`) y un conector opcional (`connector/`) instalado en el equipo del usuario.

## Desarrollo

Se requiere Node.js 22.13 o posterior y pnpm 11.24.0. Instala las dependencias siguiendo [DEPENDENCY_POLICY.md](DEPENDENCY_POLICY.md):

```sh
node scripts/install-dependencies.mjs
pnpm run build:web
```

Para iniciar la aplicación web en desarrollo (interfaz Vite y API en Miniflare), ejecuta `pnpm run dev:web`. Para ejecutar las pruebas principales desde la raíz, usa `pnpm run test:web-assets`, `pnpm run test:web-api`, `pnpm run test:runner` y `pnpm run test:connector`. Consulta [MONOREPO.md](MONOREPO.md) y la documentación de cada componente para conocer los requisitos adicionales.

## Seguridad y contribuciones

Consulta [SECURITY.es.md](SECURITY.es.md) y [CONTRIBUTING.es.md](CONTRIBUTING.es.md). No incluyas credenciales ni documentos sensibles en incidencias o cambios públicos.
