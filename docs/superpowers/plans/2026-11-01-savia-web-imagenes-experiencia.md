# Soportes de experiencia empresarial

**Objetivo:** guardar y migrar los originales de imágenes de contratos, adjudicaciones, actas y facturas de proyectos de experiencia empresarial.

**Diseño:** R2 conserva originales y D1 vincula categoría, nombre, orden y propietario a cada registro de experiencia. Las cargas usan staging recuperable. El borrado de un registro marca sus imágenes y el proyecto antes de eliminar objetos; si falla R2, la operación es reintentable y el proyecto no participa en recomendaciones. La importación desde respaldo verifica rutas internas y usa recibos por imagen para no recrear elementos retirados. La interfaz permitirá revisar, añadir y retirar soportes, señalando fallos y evitando atribuirles marca de agua automática.

1. API de imágenes y borrado reintentable del proyecto; probar aislamiento, fallos y cargas concurrentes con eliminación en Miniflare.
2. Migrar los originales disponibles desde respaldos, conservar metadatos, informar faltantes y verificar idempotencia y la distribución del runner.
3. Añadir interfaz de categorías y verificación es/en; no desplegar.

**Estado:** API de soportes implementada y borrado del proyecto marcado antes de limpiar objetos. Las pruebas de Miniflare cubren aislamiento, borrados reintentables, fallos R2 y carga concurrente con eliminación; los proyectos en eliminación se excluyen de recomendaciones y la pantalla permite reintentar. Pasaron pruebas focalizadas y compilaciones. El runner transfiere originales con recibos, informa faltantes y formatos o categorías incompatibles y no recrea imágenes retiradas. Miniflare cubre reintentos concurrentes, fallos y eliminación durante la carga; el recorrido pasó con el runner empaquetado en macOS arm64. La interfaz permite consultar, añadir y retirar soportes por categoría, con reintentos de eliminación y sin atribuir marca de agua automática; pasó la prueba de representación en ambos idiomas. Quedan pendientes la revisión visual interactiva y las pruebas con respaldos reales y otras plataformas.
