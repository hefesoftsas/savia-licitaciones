# Continuidad entre fases — plan

**Objetivo:** Ayudar a localizar y registrar posibles procesos relacionados, con evidencia y confirmación humana.

**Fuente:** Colombia Compra Eficiente documenta referencias entre fases en el expediente SECOP II. El conjunto de datos abiertos p6dx-8zbt documenta referencia, entidad, portafolio y fase, pero no identifica un campo explícito de relación entre fases. Por ello una coincidencia no es prueba de continuidad ni justifica trasladar datos automáticamente.

- [x] Buscar candidatos SECOP II por entidad y referencia o portafolio exactos, excluir el mismo proceso y presentar las fases, identificadores, fechas y enlace oficial. Indicar resultados truncados y errores.
- [x] Registrar únicamente los vínculos confirmados por la persona en SQLite; permitir retirar un vínculo. No mover tareas, documentos ni evaluaciones, y no alterar el expediente.
- [x] Integrar consulta y vínculos en la licitación guardada, mostrando advertencia y fuentes de información; abrir cada candidato en SECOP cuando exista un enlace válido.
- [x] Verificar consultas con datos sintéticos y datos públicos, confirmación y eliminación, aislamiento y migración; validar UI por IPC.

**Contraste público:** el 31 de octubre de 2026, una consulta real de Savia para `CO1.REQ.1219435` devolvió `CO1.REQ.1316064` (manifestación de interés) y `CO1.REQ.1323604` (presentación de oferta), con distintas referencias y el mismo portafolio `CO1.BDOS.1181316`. Se puede consultar el [portafolio en el conjunto oficial](https://www.datos.gov.co/resource/p6dx-8zbt.json?id_del_portafolio=CO1.BDOS.1181316). Un [informe de auditoría del Concejo de Bogotá](https://concejodebogota.gov.co/concejo/site/docs/20200113/asocfile/20200113150941/052721_evi_fo_009_informe_final_de_auditoria_recursos_fisicos.pdf) reproduce la ficha del proceso `SDH-SAMC-001-2020` e identifica manifestación de interés como fase previa a la presentación de oferta. La evidencia apoya el caso de prueba, pero no establece que compartir portafolio demuestre continuidad para todos los procesos: la persona debe revisar el enlace oficial y confirmar.

Cada búsqueda manual vuelve a consultar la fuente, para no ocultar una fase publicada desde la búsqueda anterior. Una prueba reproducible usa los identificadores y fases de este caso sin depender de la red.

Cuando cambian los identificadores del proceso guardado, la relación previa queda marcada para revisión. La persona puede buscar de nuevo y confirmar explícitamente una coincidencia actualizada sin borrar la relación primero; el vínculo conserva la nueva evidencia. Las fechas anteriores sin procedencia verificada se identifican como pendientes de verificar en SECOP. El flujo se probó mediante IPC y en una ventana estrecha.
