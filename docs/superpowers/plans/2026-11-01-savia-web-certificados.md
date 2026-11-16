# Certificados en la biblioteca web

**Objetivo:** administrar certificados de empresa y mostrar sus vencimientos en la agenda de la cuenta, preservando los campos y modos de vigencia del escritorio.

**Diseño:** registros individuales en D1 asociados al propietario con versión para evitar sobrescribir ediciones y eliminaciones simultáneas. Los campos de escritorio son opcionales; el modo sin vencimiento limpia las fechas, como en la interfaz existente. Se reutiliza `buildAgenda` para mostrar solo fechas válidas con modo `range`. La interfaz permite crear, editar y eliminar y distingue certificados de empresa de RUP y credenciales de proveedores. Las imágenes y la migración de respaldo requieren operaciones de archivos propias y se documentan pendientes hasta implementarlas.

1. Probar creación, actualización, eliminación y versiones obsoletas, origen y aislamiento en Miniflare; probar fechas y sincronización con agenda.
2. Implementar API y almacenamiento de certificados, conectarlos a agenda.
3. Integrar formulario accesible es/en y navegación desde la agenda; comprobar compilaciones y suites existentes. No desplegar.

**Estado:** registros editables con protección de cambios simultáneos y vencimientos integrados a la agenda. Los registros pueden importarse desde respaldos sin sobrescribir cambios. Las imágenes pueden cargarse y administrarse en la web e importarse desde respaldos; falta completar la revisión visual.
