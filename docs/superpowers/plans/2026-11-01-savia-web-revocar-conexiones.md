# Revocar conexiones desde la web

**Objetivo:** permitir que el usuario retire un runner o una credencial que ya no quiere usar, mediante las rutas existentes y sin exponer secretos.

1. Reutilizar las operaciones `DELETE` autenticadas y las comprobaciones de aislamiento de la API. Pedir confirmación con nombre y explicación del efecto en tareas.
2. Mantener el diálogo y permitir reintentar ante fallos; tratar un recurso ya eliminado como retirado, desactivar botones durante la petición y limpiar la selección y consentimiento si se retira la credencial elegida.
3. Verificar las pruebas existentes de propiedad y revocación en Miniflare, los builds y el análisis mecánico de interfaz. La inspección visual en navegador depende de su disponibilidad en el entorno.

**Estado:** acciones y confirmaciones disponibles en español e inglés; rutas de revocación verificadas en Miniflare. El navegador local está deshabilitado en este entorno, por lo que falta revisar visualmente los diálogos y su navegación con teclado.
