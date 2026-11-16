# Borrador de capítulo técnico con Pi local

- Crear una tarea de borrador para un capítulo hoja, con documentos y credencial seleccionados y consentimiento explícito.
- El runner autorizado obtiene únicamente el contexto del capítulo asociado a la versión de plan indicada y procesa los documentos con el parser y runtime Pi existentes.
- El resultado es una propuesta revisable, no modifica el plan automáticamente ni afirma paridad con el flujo de generación completo del escritorio.
- Aplicar el resultado requiere una acción del usuario y la misma versión de plan; no se sobrescriben ediciones posteriores ni se aceptan resultados de otros proyectos.
- Probar credenciales, concesiones, documentos, conflictos y ejecución con Pi y proveedor simulado. No usar inferencia externa en pruebas ni habilitar runner alojado.
