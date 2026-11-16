# Campos de la plantilla web

1. Guardar respuestas revisadas por el usuario en D1, vinculadas a la plantilla seleccionada y con revisión optimista por cliente.
2. Mostrar los campos agrupados por nombre, preservar cambios no guardados y permitir retirar respuestas.
3. Al solicitar la exportación, fijar la revisión de respuestas y enviar al runner solo los valores de la plantilla seleccionada; rechazar cambios concurrentes.
4. Rellenar una copia del DOCX en el runner manteniendo controles, marcadores y formato, e incluirla en el Word final sin alterar el original.
5. Verificar aislamiento, reintentos, conflictos, valores repetidos, entrada Unicode y Word válido con el helper real.
