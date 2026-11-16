# Migrar el seguimiento de licitaciones

**Objetivo:** transferir a cada proyecto importado la etapa, tareas y matriz de requisitos correspondientes al proceso de escritorio, sin mezclar licitaciones ni reemplazar cambios web.

**Origen:** las tablas `secop_tender_*` viven en la base de empresa, fuera de las instantáneas de planes. El proceso se identifica por `technical_plan_secop_context.process_id` de cada plan; para planes locales sin contexto se usa el identificador real del proyecto, nunca el identificador sintético `active`. Los proyectos cuyo vínculo no puede demostrarse no reciben seguimiento.

**Destino:** importación independiente con recibo idempotente ligado a la importación del plan. Se aplica únicamente si no hay etapa, tareas ni requisitos web. Los requisitos reciben identificadores web únicos para evitar colisiones entre proyectos y se actualizan las referencias de los capítulos que apuntaban a ellos. Una transacción guarda recibo, flujo y referencias; las repeticiones no revierten ediciones posteriores. Las valoraciones y textos originales se preservan y no se crean comparaciones RUP ficticias.

1. Probar la lectura de contexto de proyecto activo e inactivo, asociación, campos, ausencia y datos de otro proceso.
2. Probar en Miniflare importaciones repetidas, aislamiento, conflictos con ediciones web, preservación de vínculos y atomicidad.
3. Integrar CLI, inspección sin contenidos sensibles y documentación; probar un respaldo real y la distribución del runner. No desplegar.

**Estado:** la lectura, importación y remapeo están implementados. Se verificaron aislamiento, reintentos después de editar, conflicto con seguimiento existente y reversión completa ante errores de D1. Las comparaciones RUP y tareas de generación siguen fuera de este paso.
