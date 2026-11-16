# Captura de respaldo de escritorio desde el runner

**Objetivo:** permitir al usuario crear el respaldo necesario para la migración con Savia cerrada y sin modificar sus datos empresariales o su configuración.

**Arquitectura:** el runner lee el índice de empresas sin normalizar ni escribir configuración; el motor existente adquiere el bloqueo de perfil y crea una copia SQLite mediante `node:sqlite` y su API de respaldo. El archivo se publica con el escritor existente sin sobrescribir. El runner expone comandos para listar empresas y capturar una empresa elegida.

**Tecnologías:** Node 22, SQLite, motor de respaldo de escritorio, CLI del runner. Diseño `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Condiciones
- Rechazar si Savia u otra instancia posee el bloqueo; no cerrar procesos ni modificar el workspace o la configuración.
- El destino debe ser absoluto, nuevo y estar fuera de la carpeta de datos del perfil, incluidos enlaces simbólicos.
- No incluir las claves de proveedor ni licencias globales; advertir que el respaldo empresarial no está cifrado.
- La copia SQLite debe incluir datos WAL y validar integridad; no copiar archivos SQLite en vivo directamente.
- Conservar el comportamiento del servicio de respaldo existente; no desplegar ni habilitar runners alojados.

## Verificación
1. Crear datos reales en WAL, dos empresas y configuración con un secreto ficticio; probar listado y captura vía CLI.
2. Verificar integridad, archivos, exclusión de secretos, configuración y origen intactos, destino existente y dentro del perfil.
3. Mantener bloqueo exclusivo en otro proceso/conexión y comprobar que no se crea respaldo ni se cierra Savia.
4. Ejecutar suites de runner/API, comprobación Node, pruebas del motor existente y distribución independiente.
