# Rotación de credenciales de Savia web

**Objetivo:** permitir cambiar la clave de cifrado sin perder acceso a las credenciales existentes. La versión anterior se conserva como secreto externo durante la transición; la clave activa cifra las credenciales nuevas. No configurar secretos ni desplegar recursos.

**Diseño:** `CREDENTIAL_KEY_ID` y `CREDENTIAL_KEY_HEX` siguen siendo la clave activa. `CREDENTIAL_PREVIOUS_KEYS_JSON`, secreto opcional, mapea identificadores anteriores a claves hexadecimales. El runner puede descifrar con la clave correspondiente solo durante una concesión vigente. `POST /api/provider-credentials/rotate` recifra exclusivamente credenciales activas del usuario autenticado con IV nuevo y comparación de la versión anterior; informa contadores, nunca secretos. La operación es repetible y no modifica credenciales revocadas. La configuración inválida falla cerrada. Las claves antiguas no se retiran hasta confirmar que no quedan filas usándolas, incluidos los usuarios inactivos y las copias de seguridad.

1. Probar en Miniflare con dos cuentas, cambio y ausencia de clave anterior, recifrado, repetición, corrupción y revocación.
2. Implementar selección estricta de claves y rotación por cuenta sin alterar las concesiones ni añadir proveedores.
3. Documentar el procedimiento, límites de operación y recuperación. Ejecutar pruebas enfocadas y verificar configuración Wrangler.

**Estado:** soporte de transición y recifrado por cuenta implementados y probados en Miniflare; las claves siguen fuera del repositorio y no se ha desplegado nada. Falta una operación de mantenimiento que cubra todas las cuentas y una revisión operativa antes de producción. Hasta entonces no debe retirarse ninguna clave anterior basándose únicamente en el resultado de una cuenta.
