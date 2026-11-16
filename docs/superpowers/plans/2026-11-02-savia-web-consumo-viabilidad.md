# Consumo de tareas de viabilidad

Registrar en cada intento los tokens comunicados a Pi en análisis, índice, parámetros y generación/revisión de capítulos. Agregar las llamadas de un mismo intento, informar los datos faltantes y guardar el consumo con el resultado de éxito o fallo cuando el runner conserve la concesión. Mostrar la información con etiqueta de último intento, sin afirmar que cubre reanudaciones anteriores, llamadas sin datos o facturación. Si se pierde la concesión o el proceso se interrumpe sin entregar resultado, no se garantiza recuperación del consumo. No crear un historial ni estimar precios.

Probar la composición de callbacks, agregación multillamada, errores, persistencia y visualización es/en, junto con las pruebas del runner y Miniflare. No ejecutar inferencia real ni despliegue.
