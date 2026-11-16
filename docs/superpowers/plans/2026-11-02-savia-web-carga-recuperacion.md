# Recuperación de cargas de archivos web

La carga directa de proyecto no tiene staging ni recibo idempotente. Primero registrar cada objeto antes de escribir R2, vincular archivo y retiro de staging en una transacción D1, y aprovechar el limpiador existente con concesiones y vigilancia de escritores inciertos. Ejecutar una limpieza acotada en cargas posteriores; no añadir Cron ni despliegues. Conservar streaming y el aislamiento de cuenta.

La idempotencia exige una huella verificable del contenido sin cargar archivos grandes en memoria y una asociación estable en el cliente. Diseñarla y probarla como paso posterior, sin afirmar que staging por sí solo evita duplicados. Una interrupción puede conservar temporalmente registros en vigilancia hasta que se reintente la limpieza.

Probar en Miniflare carga, interrupciones, fallos de D1/R2, carrera con limpieza y acceso entre cuentas, además de comprobar que el cuerpo no se materializa en memoria. No conectar servicios reales.

La carga web utiliza ahora `desktop_file_staging` y publica la fila y retira el staging en la misma transacción D1. Una carga posterior intenta limpieza acotada para su propietario. En Miniflare se verificaron una carga de 8 MiB, fallos de transacción, un escritor que termina después de vencer y la limpieza de un objeto huérfano. El seguimiento de un escritor cuya finalización no se pudo confirmar puede permanecer en vigilancia y requiere una limpieza posterior. En esta etapa inicial aún no había limpieza periódica ni idempotencia; la actualización siguiente describe lo implementado después.

**Actualización:** la carga con clave de idempotencia verifica en streaming la huella y los metadatos antes de devolver el documento previo. La interfaz conserva la clave mientras la página está abierta. El runner continuo llama al limpiador acotado cuando queda libre, al iniciar y como máximo una vez por hora por proceso; sin runner activo o carga posterior no hay limpieza automática. No se agregó Cron. Miniflare y el CLI local verificaron limpieza de objetos abandonados, aislamiento y conservación de archivos activos y vinculados. Los registros con escritor incierto siguen vigilándose.
