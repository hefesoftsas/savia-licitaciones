# Oferta económica web

- Reutilizar el cálculo y la exportación CSV existentes; mantener los borradores incompletos.
- Guardar cada borrador por proyecto y propietario en D1, con versión para detectar escrituras simultáneas.
- Adaptar el formulario existente a la API web, preservando el comportamiento Electron y serializando las operaciones del mismo formulario.
- Verificar aislamiento, persistencia, conflicto, cálculos y CSV en Miniflare, las pruebas del servicio de escritorio y la compilación.

La aritmética pura se ejecuta en el Worker, sin inferencia ni runner alojado. El resto de la migración permanece pendiente.
