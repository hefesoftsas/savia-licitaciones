# Cuenta web: cambio de contraseña

La cuenta autenticada puede cambiar su contraseña actual y elegir cerrar las demás sesiones. Better Auth valida la contraseña actual y actualiza la sesión; la interfaz no almacena los valores ni expone el token devuelto. La confirmación y la longitud se validan antes de enviar.

Miniflare verifica el rechazo sin sesión, de origen ajeno, de contraseña incorrecta y de contraseñas cortas; también comprueba que la sesión nueva sigue activa, las demás sesiones de la misma cuenta se cierran, otra cuenta permanece activa y la contraseña anterior deja de funcionar. Esto no es una copia de seguridad de los datos.

## Recuperación y verificación por correo

Better Auth genera y valida enlaces temporales de verificación y de recuperación; al cambiar una contraseña olvidada revoca las sesiones de esa cuenta. La pantalla de acceso permite solicitar o reenviar enlaces y cambiar la contraseña, sin guardar contraseñas ni tokens en el navegador. Las respuestas para cuentas inexistentes no las identifican. Al exigir la verificación también se deniega el acceso mediante sesiones y runners de cuentas antiguas no verificadas; los runners vuelven a funcionar al verificar la cuenta.

La configuración `wrangler.web.local.jsonc` usa un binding `EMAIL` simulado y `savia@example.com` para desarrollo: Wrangler registra los mensajes y no los envía, por lo que sus enlaces son confidenciales incluso en los logs locales. `AUTH_REQUIRE_VERIFIED_EMAIL=true` exige verificar nuevos accesos y requiere tanto el binding como `AUTH_EMAIL_FROM`; si falta alguno, la aplicación rechaza la configuración. Sin la opción se conserva el comportamiento anterior. Antes de admitir usuarios reales se necesita un dominio remitente habilitado en Cloudflare Email Service, configurar su binding y remitente, activar la verificación y probar la entrega real y la configuración del entorno; no se ha realizado ningún despliegue ni envío real.

Las pruebas con D1 en Miniflare usan un buzón simulado y comprueban los enlaces, su expiración y uso único, sesiones anteriores, recuperación y aislamiento. No sustituyen una prueba de entrega real o una revisión completa previa a producción.
