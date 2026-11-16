# Experiencia empresarial en la web

**Objetivo:** llevar a la cuenta web los proyectos de experiencia de la biblioteca de credenciales del escritorio y usarlos, con consentimiento, como fuente de oportunidades personalizadas. Son registros empresariales y no proyectos de licitación.

**Diseño:** conservar en D1 los diez campos de `credential_library_projects` por cuenta, con IDs propios y control de versión para editar o eliminar. Mantener texto histórico sin inferir valores o fechas. La captura de recomendaciones usa hasta doce proyectos ordenados como en escritorio y cambia su huella cuando cambia el contenido relevante. La migración del respaldo usa recibos idempotentes por registro, conserva fechas y valores históricos, y nunca recrea registros eliminados. Las imágenes de soporte requieren almacenamiento y migración independientes; no se envían implícitamente a un proveedor. La interfaz es/en permitirá revisar y gestionar la experiencia sin confundirla con las licitaciones.

1. API CRUD y fuente de recomendaciones; probar aislamiento, concurrencia, borrado y cambios de huella en Miniflare.
2. Importación desde respaldo con recibos, conflictos y reintentos; conservar relaciones y avisar de originales ausentes.
3. Interfaz editable es/en y gestión de imágenes de soporte; verificar compilaciones, sin despliegue.

**Estado:** API privada y versionada, fuente de recomendaciones y migración con recibos implementadas. Miniflare verificó aislamiento, concurrencia, reintentos, eliminación y reversión transaccional; el recorrido también pasó con runner empaquetado en macOS arm64. Los soportes disponibles se transfieren con recibos y el comando informa los ausentes o incompatibles. La interfaz es/en permite buscar, crear, editar y eliminar registros con protección de borradores y conflictos; conserva fechas y tipos históricos. Pasaron las pruebas de representación y las compilaciones de escritorio y web. Los controles de imágenes permiten consultar, añadir y retirar soportes por categoría. Quedan pendientes la revisión visual interactiva (el navegador local está deshabilitado), las pruebas con un respaldo real y otras plataformas.
