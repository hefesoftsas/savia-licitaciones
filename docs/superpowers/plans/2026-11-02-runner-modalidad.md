# Contrato de modalidad del runner

Preparar una identificación explícita y controlada por el servidor para distinguir runners locales de una futura modalidad alojada. La migración marca las instalaciones anteriores como `local`; el emparejamiento solo admite y devuelve `local`, y el listado de cuenta informa esa modalidad. Una identidad marcada como `hosted` no puede autenticarse ni reclamar trabajos. No hay registro, aprovisionamiento, selección, ejecución ni conmutación automática a runners alojados.

La habilitación futura requerirá un diseño independiente para asignación explícita por tarea, autorización, límites y costos, aislamiento, credenciales, aprovisionamiento y apagado, además de pruebas antes de activar cualquier servicio. La presencia del valor reservado no habilita esas funciones ni indica que estén listas.

**Verificación:** migración SQLite con runners anteriores, validación del emparejamiento, listado aislado, rechazo de heartbeat y reclamación para una identidad marcada como alojada, y regresión de la cola en Miniflare. No se ha desplegado la migración ni se ha activado ejecución alojada.
