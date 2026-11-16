# Rotación de credenciales por lotes

La rotación por cuenta debe poder avanzar con un número acotado de credenciales por petición. Mantener la respuesta existente para cuentas pequeñas; si hay más filas, devolver el ID de continuación que el mismo usuario envía en la siguiente petición. Ordenar por ID y avanzar incluso si una credencial falla, sin omitir el contador de errores. El cursor no autoriza acceso a otras cuentas ni sustituye la comprobación de claves pendientes antes de retirarlas. Validar la entrada, no mostrar secretos y conservar el control de cambios concurrentes.

1. Probar más de un lote con Miniflare, otra cuenta aislada y una fila dañada antes del cursor; verificar progreso y reintento posterior.
2. Limitar la lectura y el trabajo criptográfico por petición, conservando el contrato anterior cuando no haga falta continuación.
3. Documentar el protocolo y verificar las pruebas focalizadas sin desplegar ni cambiar claves reales.

**Avance:** la API procesa hasta 50 filas y devuelve `nextCursor` cuando quedan más. Miniflare verificó 52 credenciales, una fila dañada, continuación, reparación y reintento, junto con la prueba existente de aislamiento y acceso de runners durante la rotación. Continúan pendientes la automatización por cuenta, el procedimiento operativo completo y la validación en Cloudflare real.

Cuando el runner obtiene una credencial antigua bajo concesión vigente, la API intenta recifrarla con la clave activa usando una actualización condicionada a la versión anterior. Un fallo de escritura o una actualización simultánea no impide entregar la credencial ya descifrada; las credenciales que no se utilicen siguen pendientes y hay que conservar las claves anteriores hasta comprobar toda la base. Miniflare verificó la migración durante una tarea y una prueba adicional simuló un fallo de escritura. No hay recorrido automático de todas las cuentas ni prueba remota.

## Continuación por sesión

Al abrir una sesión web verificada, recorrer automáticamente hasta 100 lotes de la cuenta, sin almacenar cursores en el navegador y sin impedir el acceso si falla. Cancelar al cerrar o cambiar la sesión. Cada solicitud debe incluir la identidad esperada y la API debe rechazarla si no coincide con la sesión efectiva; un cursor no puede autorizar acceso a otra cuenta. Detener ante respuestas inválidas o cursores que no avanzan. Los fallos se reintentan al abrir de nuevo y las cuentas inactivas siguen requiriendo atención operativa. Probar paginación, cancelación, aislamiento y compilaciones sin activar servicios remotos.

El recorrido se inicia al abrir la sesión y se cancela al cambiarla; el servidor comprueba la identidad esperada antes de modificar filas. Las pruebas verifican 52 credenciales, fallo y reintento, identidad distinta, límites de páginas y cancelación. La API sigue siendo compatible con llamadas anteriores que omiten la identidad esperada. No hay estado persistido en el navegador ni rotación automática de cuentas inactivas; la terminación del recorrido no demuestra que todas las credenciales fallidas estén reparadas.
