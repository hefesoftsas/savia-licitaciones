# Migración del seguimiento PAA

**Objetivo:** trasladar planes seguidos y avisos revisados o pendientes desde un respaldo de escritorio a la cuenta web.

**Diseño:** el runner lee las dos tablas del respaldo sin consultar SECOP y cuenta los avisos huérfanos. Cada plan y sus avisos se envían como unidad con un recibo inmutable por respaldo y plan. Una transacción crea el seguimiento y los avisos solo si no existe ya un seguimiento web; los conflictos se informan sin sobreescribir. El recibo permanece después de dejar de seguir, de modo que repetir la importación no restablece ese plan. Las solicitudes concurrentes se resuelven por la unicidad y la generación de seguimiento existente; no se inicia cómputo alojado.

1. Probar lectura e importación reales en Miniflare: sesiones aisladas, avisos y estados, reintentos, conflictos, eliminación y avisos huérfanos.
2. Implementar lector, CLI y API transaccional; probar solicitudes concurrentes, fallos y ausencia de consultas a SECOP.
3. Documentar y verificar runner empaquetado y pruebas relacionadas; no desplegar.

**Estado:** importación por plan con avisos implementada; verificadas concurrencia, reversión, aislamiento, conflictos y reintentos. Los avisos huérfanos se cuentan, permanecen en el respaldo y no se atribuyen a un plan incorrecto.
