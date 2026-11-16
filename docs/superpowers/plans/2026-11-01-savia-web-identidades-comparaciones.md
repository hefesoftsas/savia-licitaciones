# Identidades para migrar comparaciones RUP

**Objetivo:** conservar la relación verificable entre requisitos y hechos del escritorio y sus identificadores nuevos en la nube, como base de la migración de comparaciones y sus fuentes.

**Diseño:** durante las transacciones de importación existentes se guardan mapas por cuenta y recibo para requisitos y datos RUP; las claves originales se toman del respaldo y las de destino son las ya asignadas a los registros web. Los reintentos mantienen los mapas y no revierten ediciones. Los recibos anteriores no contenían correspondencias: no se adivinan por título, valor u orden. Su resolución requerirá revisión posterior. Los mapas no conceden acceso al contenido y no vinculan certificados históricos por sí solos.

1. Agregar pruebas de correspondencia, aislamiento, reintento, colisión entre proyectos y reversión transaccional.
2. Añadir las tablas y escribir los mapas dentro de las transacciones existentes de migración de flujo y RUP.
3. Ejecutar pruebas Miniflare y verificar la distribución; luego implementar la migración de instantáneas y PDF históricos con revisión explícita.

**Estado:** mapas transaccionales para importaciones nuevas e inspección local de comparaciones y sus PDF implementados. Las comparaciones se transfieren como históricos separados según el plan `2026-11-01-savia-web-importar-comparaciones.md`. Los mapas no se reconstruyen para recibos previos; los históricos sin vínculo verificable permanecen visibles sin asociar. El resumen del respaldo solo informa cantidades y fuentes ausentes, sin mostrar valores.
