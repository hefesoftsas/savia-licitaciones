# Integridad de la bandeja cifrada del runner

La escritura de una copia recuperable debe rechazar antes de publicarla cualquier resultado que el lector no pueda abrir por su límite de tamaño. El runner seguirá intentando entregar el resultado normal y avisará si no pudo guardar la copia; las etapas parciales que exigen conservación se detendrán sin publicar un archivo ilegible.

El traslado a rechazados debe publicar el archivo ya completo de forma atómica y conservar la copia pendiente hasta entonces. Probar el límite en bytes UTF-8, reintentos, colisiones y recuperación, sin sobrescribir resultados existentes ni desplegar.
