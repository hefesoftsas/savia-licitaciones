# Corrección anónima asistida por Pi

**Objetivo:** permitir que Pi atienda problemas que las reglas automáticas no corrigen, manteniendo una copia revisable y la inspección de la copia final.

**Diseño:** una nueva tarea y consentimiento explícito identifican la inspección y sus fuentes. Como el runner puede ser distinto, la tarea vuelve a inspeccionar y revisar con Pi en un espacio temporal, y reanuda esa sesión para editar solo la copia mediante las herramientas OpenXML del escritorio. Se informa del consumo adicional. Si Pi falla después de modificar la copia, se vuelve a inspeccionar su estado real y se informa del fallo; nunca se altera el original. No se activa un runner alojado ni se amplían proveedores.

1. Probar en local el ciclo de revisión, edición acotada, validación, reinspección y preservación de la copia cuando falla Pi.
2. Integrar consentimiento, fuentes, credenciales y un nuevo tipo de tarea para que runners antiguos no lo reclamen.
3. Añadir controles explícitos, costos y resultados a la interfaz.
4. Verificar Miniflare, el runner empaquetado y compilaciones; señalar falta de prueba con proveedor real o de validación visual.

**Verificación:** pruebas con helper real y runtime Pi simulado ejecutaron una edición OpenXML, validación y reinspección, verificaron cambios parciales tras fallo, preservación del original y cancelación sin entrega. Miniflare cubrió consentimiento, credencial y pliego; el mismo flujo pasó con el módulo empaquetado en macOS ARM. Compilaron escritorio y web. Pendientes: prueba con proveedor real, validación visual interactiva y otras plataformas. La revisión se repite y puede generar consumo adicional; las imágenes no se inspeccionan visualmente.
