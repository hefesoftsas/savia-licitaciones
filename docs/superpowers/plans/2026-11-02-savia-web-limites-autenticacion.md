# Límite compartido de autenticación

Better Auth se instancia en un Worker y el almacenamiento por defecto de límites vive en memoria. Usar D1 como almacenamiento compartido del limitador de Better Auth, con la IP proporcionada por Cloudflare, y habilitarlo también en Miniflare. Mantener las reglas predeterminadas salvo cinco intentos de acceso y diez de cambio de contraseña por diez segundos, para permitir los flujos de recuperación; separar el contador del respaldo de datos y no guardar contraseñas ni crear servicios adicionales.

1. Probar límite de acceso con una IP, independencia de otra IP y persistencia tras reiniciar el runtime con D1 persistente.
2. Añadir el esquema y configuración correspondientes y clasificar la tabla como dato efímero excluido del respaldo.
3. Probar autenticación y el inventario de esquema en Miniflare. No desplegar ni modificar Cloudflare real.

**Avance:** Better Auth usa D1 y `cf-connecting-ip`; los contadores quedan excluidos del respaldo. Miniflare verificó reinicio de runtime, IP independiente y solicitudes simultáneas. La suite completa pasó 158 de 159 pruebas: el flujo de cambio de contraseña encontró un límite demasiado bajo. Se ajustó esa ruta a diez solicitudes por diez segundos y después pasaron las siete pruebas focalizadas, incluido ese flujo. No se repitió la suite completa tras ese ajuste. La tabla contiene IP normalizada y ruta; la limpieza es oportunista y aún falta definir una retención máxima y validar Cloudflare real.

El almacenamiento compartido ahora transforma la IP y la ruta en una huella HMAC con el secreto de autenticación antes de escribirlas; la migración `0134` retira los contadores previos en texto claro. Una única sentencia D1 decide y actualiza el contador; se limpian oportunistamente lotes de hasta 100 entradas de más de 24 horas. Las pruebas verifican ventana, concurrencia, reinicio, ausencia de IP y ruta en D1 y limpieza de entradas anteriores. Sin tráfico no se garantiza una fecha máxima de eliminación y no se ha probado el servicio en Cloudflare real.

Tras el ajuste de las reglas y el cambio de almacenamiento, la suite completa de la API pasó 161 pruebas con Miniflare, sin omisiones.
