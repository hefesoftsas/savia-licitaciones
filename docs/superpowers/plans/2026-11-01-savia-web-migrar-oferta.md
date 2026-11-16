# Migración de oferta económica

**Objetivo:** importar el borrador económico asociado al proceso del plan, conservando sus datos, incluso si el cálculo está incompleto, sin sobrescribir la oferta web.

**Diseño:** leer `economic_offer_drafts` de la base de empresa usando exactamente el vínculo de proceso del plan activo o de su instantánea. No inferir la asociación a partir del identificador sintético `active`. Aceptar el campo de moneda ausente en borradores antiguos como cadena vacía, preservando el resto. Una operación independiente con recibo y transacción en D1 crea el borrador solo si aún no existe; reintentos idénticos no revierten cambios posteriores. El cálculo y la exportación siguen usando el motor compartido existente.

1. Probar la lectura del respaldo, borradores incompletos, asociación de proyectos y ausencia de identificador fiable.
2. Probar en Miniflare la importación, aislamiento, reintentos, conflictos y reversión de errores, además del cálculo real.
3. Integrar CLI, resumen sin valores sensibles y documentación; verificar runner empaquetado y no desplegar.

**Estado:** lectura y transferencia implementadas con comprobación de conflictos y recibo independiente. Las pruebas incluyen borradores incompletos, cálculo tras edición, aislamiento y reversión de transacción.
