# Historial de consultas del escritorio

**Objetivo:** conservar y consultar el historial de cada proyecto importado sin atribuirlo a otro proyecto ni enviarlo implícitamente al modelo.

**Diseño:** el runner lee `tender_chat_messages` por el identificador real del proyecto, no por el proceso SECOP ni el identificador sintético `active`; conserva orden, roles, estados, texto y metadatos de preguntas. Un recibo independiente e idempotente vincula el historial al proyecto ya importado. La web lo muestra como histórico separado y no lo integra en el contexto de nuevas tareas porque no hay evidencia de las fuentes usadas. Los mensajes en ejecución permanecen históricos, nunca se reanudan.

1. Probar lectura de proyecto activo e instantáneo, ausencia de identificador y columnas antiguas; no publicar el contenido en la inspección.
2. Probar y construir importación y consulta aisladas, reintentos y conflictos de contenido.
3. Integrar CLI e interfaz es/en, documentar y verificar runner empaquetado y compilaciones; no desplegar.

**Estado:** lectura, recibo y consulta implementados con aislamiento y reintentos; se conserva el texto y las preguntas sugeridas sin incluirlos en nuevas consultas. La revisión visual sigue pendiente en el entorno.
