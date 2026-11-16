# Recuperación de borradores técnicos pendientes

**Objetivo:** conservar cifrado el borrador generado antes de enviarlo y evitar repetir inferencia tras un cierre o desconexión durante la entrega.

1. Usar una bandeja cifrada independiente de resultados finales, con un borrador por tarea y la concesión original. Guardar antes del envío y retirar solo tras confirmación.
2. Recuperar los pendientes antes de reclamar una tarea. Reenviar únicamente bajo la concesión original; conservar en rechazados los que ya no sean aceptados, con exportación explícita para revisión. No publicar una finalización fallida mientras haya una entrega transitoria pendiente.
3. Integrar la bandeja en la CLI y evitar que un nuevo emparejamiento destruya la capacidad de descifrarla. Probar respuesta perdida, reinicio, vencimiento, cancelación, cifrado y empaquetado.

**Estado:** la bandeja independiente guarda cifradas tanto la planificación como los borradores antes del envío y los recupera antes de reclamar otra tarea. Se conserva como máximo una etapa pendiente por tarea: la planificación debe confirmarse antes de redactar, y cada borrador antes de continuar. La CLI permite listar, exportar y retirar etapas rechazadas y no permite volver a emparejar mientras existan copias. Al reanudar el mismo lote en el mismo runner, se intenta entregar la etapa rechazada con la nueva concesión antes de generar; el servidor verifica de nuevo la versión y las fuentes. Si la rechaza, la copia se conserva para revisión manual. La tarea interrumpida puede necesitar reanudación desde la web.
