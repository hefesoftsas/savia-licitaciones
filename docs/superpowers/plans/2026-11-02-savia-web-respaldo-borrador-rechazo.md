# Recuperar el borrador de causales de rechazo

El borrador del proyecto contiene causales, comprobaciones adicionales y opciones editadas por el usuario. Incluirlo en la captura parcial y recuperarlo en un proyecto nuevo, preservando su fecha y sin sobrescribir ediciones hechas después de una recuperación anterior. Si no existe borrador guardado, mantener los valores iniciales del proyecto. Capturas anteriores siguen siendo recuperables.

1. Comprobar propiedad y revisión del borrador junto con los datos del proyecto.
2. Añadir recibo privado e importación idempotente con validación equivalente al formulario; no transmitir credenciales ni reanudar tareas.
3. Integrar manifiesto y restauración, y probar Miniflare, compatibilidad con capturas anteriores y runner empaquetado sin despliegue ni inferencia.

**Avance:** la captura incorpora el borrador guardado y detecta cambios de versión; la restauración conserva texto, opciones y fecha en una versión inicial con recibo idempotente. Miniflare verificó aislamiento entre cuentas, capturas anteriores, importaciones simultáneas, conflicto de contenido, ediciones posteriores y eliminación sin recreación. El recorrido también pasó con el runner empaquetado en macOS ARM. La captura sigue siendo parcial y no incluye los informes de duplicados ni los de causales de rechazo.

Los informes de duplicados y rechazo se incorporaron después; su alcance y verificaciones están documentados en `2026-11-02-savia-web-respaldo-revisiones.md`. La captura sigue siendo parcial.
