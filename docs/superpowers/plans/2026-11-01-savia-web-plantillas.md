# Extracción de plantillas Word

1. Crear una tarea ligada a la versión del plan y a los documentos Word elegidos, con consentimiento para usar el proveedor.
2. Ejecutar el flujo de extracción de escritorio con Pi y el helper OpenXML aislados en la máquina del usuario; conservar las identidades de capítulos y limpiar temporales.
3. Guardar el documento y catálogo de campos de la tarea en la nube, con acceso por propietario y concesión vigente, y ofrecer revisión y descarga.
4. Asociar explícitamente una extracción vigente con el plan y usarla en la exportación Word; invalidarla al cambiar plan o fuentes.
5. Probar aislamiento, cancelación, pérdidas de conexión, cambios de versión y extracción con helper real; conservar la limitación visible hasta completar todo el flujo.
