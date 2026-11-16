# Adjuntar un original ausente

**Objetivo:** permitir que el usuario adjunte un archivo a una entrada de biblioteca importada sin original y conserve sus entradas históricas.

**Diseño:** la selección y confirmación son explícitas: la aplicación no puede demostrar que el archivo elegido sea el original histórico. La API permite una sola asignación para un registro sin fuente, con límite de tamaño, staging R2 y operación D1 condicionada. Un recibo permite reintentar el mismo archivo sin sustituir uno diferente. La eliminación obtiene la clave y estado actuales al marcar el registro para evitar huérfanos cuando compite con la carga. Las entradas históricas permanecen separadas de las citas aceptadas.

1. Probar propiedad, origen, archivos inválidos, cargas iguales y distintas concurrentes, fallo D1/R2 y carrera con eliminación.
2. Implementar API y limpieza recuperable; verificar que los reintentos del respaldo no reviertan el archivo adjuntado.
3. Integrar selección y confirmación es/en, mensajes de error y actualización de la lista. Verificar builds y pruebas sin desplegar.

**Estado:** carga y consulta implementadas; verificadas cargas idénticas y distintas simultáneas, aislamiento, fallo D1/R2 y eliminación con lectura previa al adjunto. El nombre del archivo adjuntado se conserva y se usa para la descarga. Falta revisión visual en navegador, deshabilitado en el entorno.
