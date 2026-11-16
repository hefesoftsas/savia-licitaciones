# Monorepo y servicio de licencias

- Conservar las rutas de cliente, herramientas y servicios para mantener empaquetado y CI; declarar los paquetes en el espacio de trabajo y ofrecer comandos desde la raíz, manteniendo las instalaciones npm existentes por paquete.
- Fijar Wrangler en el servicio de licencias y usar su Miniflare local con almacenamiento Durable Objects SQLite. Verificar activación de tres equipos, rechazo del cuarto y liberación, usando secretos efímeros en pruebas.
- Preparar OpenTofu con proveedor Cloudflare fijado para el dominio personalizado del Worker. Wrangler conserva la publicación y migraciones del código; ningún secreto entra en archivos ni estado de OpenTofu. No aplicar infraestructura ni desplegar sin configuración y autorización.
- Documentar orden de instalación, desarrollo, pruebas y despliegue, junto con la separación de estado y secretos. Verificar la compilación del cliente, pruebas del servicio, Miniflare y validación de OpenTofu; revisar los cambios y crear el commit solicitado.
