# Migración de análisis del plan de escritorio

**Objetivo:** conservar y permitir consultar todos los resultados de análisis del pliego presentes en un respaldo, sin sustituir análisis actuales ni fingir que sus fuentes se verificaron.

**Arquitectura:** el runner lee `technical_plan_bid_items` de la base activa y de las instantáneas, además del resumen histórico de metadatos cuando existe. Una operación autenticada con recibo independiente almacena un conjunto inmutable vinculado al proyecto importado; los reintentos del mismo respaldo recuperan el recibo y no crean otro proyecto. La API de análisis devuelve el conjunto histórico y la interfaz lo muestra como contenido importado, sin ejecutarlo, aceptarlo ni enviarlo al modelo. Las categorías y estados originales se conservan, incluso si no corresponden a los tres análisis que la web admite hoy.

**Restricciones:** sin cambios al hash del recibo de proyecto; preservación de contenido y orden; aislamiento por cuenta; no sustituir análisis web; no incluir contenido en la vista de inspección por CLI; no reanudar tareas antiguas; no desplegar.

**Verificación:** probar respaldo activo/inactivo y tabla ausente; importación concurrente, reintentos, conflicto, aislamiento y fallo transaccional en Miniflare; traslado real por el runner; compilaciones y suites; mostrar advertencia de fuentes desconocidas con HTML no confiable desactivado.

**Estado:** implementado y probado con respaldo real en Miniflare, suites de API y runner, compilaciones y distribución preliminar. Una prueba del runner falló durante una ejecución con varias compilaciones y suites simultáneas y pasó al repetir la suite por separado. La revisión visual manual sigue pendiente porque el navegador integrado está deshabilitado. Los resultados se conservan para consulta: aún no se pueden aceptar como análisis de la web ni participan en la generación del índice.
