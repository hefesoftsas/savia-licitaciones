# Exportación de resultados recuperables

La recuperación manual no debe mostrar un archivo final incompleto si falla la escritura. Escribir el JSON en un temporal privado en la misma carpeta, cerrar y sincronizarlo y publicarlo sin reemplazar un destino existente. La copia cifrada se conserva hasta que el usuario la descarte. Probar fallos de publicación, colisiones y exportación del CLI.

La publicación se comprobó con un fallo simulado, archivos existentes y las pruebas de bandejas. Un cierre forzado puede dejar el temporal en texto legible; la operación no garantiza recuperación automática de ese archivo ni se ha probado en Windows. No se modifica la concesión ni se reejecuta la tarea.
