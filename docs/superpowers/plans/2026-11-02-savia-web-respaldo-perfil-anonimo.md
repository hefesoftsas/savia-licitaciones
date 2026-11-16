# Captura del perfil de revisión anónima

**Objetivo:** conservar el perfil personalizado por proyecto durante la recuperación parcial sin reemplazar ediciones posteriores.

**Diseño:** incorporar el perfil y su versión a la revisión de captura y transportar el perfil normalizado con su fecha. La importación de runner crea el perfil de destino y un recibo atómico por cuenta y solicitud; una repetición no sobrescribe el perfil, y una captura anterior sin este componente sigue funcionando. El perfil predeterminado sin registro no crea datos nuevos.

**Pruebas:** Miniflare verifica aislamiento, cambios durante la captura, preservación de los campos, importación repetida, modificaciones posteriores y el recorrido completo con el runner empaquetado. La recuperación sigue siendo parcial y no restaura las inspecciones históricas.
