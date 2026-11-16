# Plantilla Cloudflare para Savia web

1. Preparar una plantilla independiente con Worker, assets, D1, R2 y correo, sin rutas públicas ni secretos.
2. Probar localmente la compilación con Wrangler y verificar los bindings permitidos.
3. Documentar las sustituciones y requisitos pendientes; no crear recursos ni desplegar.

**Verificación local:** la plantilla actual compila con `wrangler deploy --dry-run` y el sitio compilado pasó la prueba de un solo origen con Wrangler y Miniflare después de las migraciones recientes. La prueba cubre Better Auth, dos cuentas, proyectos, archivos, emparejamiento y acceso a una credencial de prueba; no verifica entrega real de correo, recursos remotos, costos ni paridad completa. La plantilla mantiene `workers_dev: false`, sin ruta pública ni recursos de ejecución alojada. No se crearon recursos ni se desplegó.

La prueba de sitio también crea un requisito y un soporte, comprueba que aparecen en la revisión previa y verifica que otra cuenta no puede leerla. Es una comprobación HTTP local, no una inspección visual ni un despliegue real.
