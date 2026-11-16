# Correo de cuenta web: plan de implementación

**Objetivo:** permitir recuperar una contraseña y verificar el correo con Better Auth y correo transaccional de Cloudflare, comprobando el flujo sin correo real en Miniflare.

**Arquitectura:** Better Auth emite y valida sus propios enlaces temporales; un binding `EMAIL` entrega mensajes de texto. La verificación obligatoria solo se activa explícitamente junto con el correo configurado; un despliegue incompleto falla cerrado. La interfaz presenta recuperación y verificación sin almacenar contraseñas o tokens. Las instalaciones actuales no cambian de comportamiento hasta configurar el servicio.

**Pruebas:** cuentas existentes e inexistentes, verificación antes de acceder, caducidad y un solo uso del enlace de contraseña, revocación de sesiones, aislamiento de cuenta y error de configuración. Comprobar build web y rutas reales en Miniflare.

**Restricciones:** no enviar correo real ni desplegar; un dominio remitente configurado en Cloudflare es requisito para producción. No habilitar servicios de inferencia.
