# Orden de la biblioteca web

**Objetivo:** conservar el orden de carpetas y documentos del escritorio al importarlos y permitir ajustarlo desde la web sin perder cambios de otra sesión.

**Diseño:** columnas `sort_order` ordenan carpetas por cuenta y documentos por carpeta. La migración conserva el orden que ya muestra la web. Los elementos nuevos e importados se agregan al final; el runner ya recorre el respaldo en orden. Cada solicitud de reordenamiento incluye el orden anterior y el nuevo; una transacción D1 verifica la secuencia completa y el propietario antes de modificarla. Los botones de mover arriba/abajo son accesibles con teclado. La búsqueda mantiene su orden por fecha.

1. Probar migración del orden existente, importación en orden, propiedad, listas incompletas, cambios simultáneos y reintentos en Miniflare.
2. Implementar columnas, inserciones, lectura y reordenamiento transaccional.
3. Añadir controles es/en y verificar pruebas, compilaciones y runner empaquetado. No desplegar.

**Estado:** migración, importación y controles implementados. La API rechaza vistas obsoletas y las pruebas cubren el aislamiento, la concurrencia y la reversión ante fallo. Compilan escritorio y web; verificado con el runner empaquetado. Pendiente revisión visual en navegador.
