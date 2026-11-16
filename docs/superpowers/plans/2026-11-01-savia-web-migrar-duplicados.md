# Migración de revisión de duplicados

**Objetivo:** conservar y consultar en la web la revisión de duplicados existente del escritorio y sus archivos disponibles, sin afirmar que se pueden ejecutar nuevas revisiones hasta implementarlas.

**Diseño:** la revisión es un estado por empresa repartido en tablas SQLite, con originales elegidos desde rutas arbitrarias y textos extraídos en `workspace/duplicate-check/contents`. El lector del runner recopilará las tablas de resultados y solo resolverá archivos dentro del respaldo mediante identidades verificables; indicará los originales externos y textos faltantes. El servicio deberá aislar los datos por cuenta, conservar recibos idempotentes y no sobrescribir cambios o recrear contenido borrado. Una vista web permitirá revisar los resultados y su procedencia. No se activa cómputo alojado ni se consultan proveedores.

1. Probar la extracción de tablas y textos con rutas macOS/Windows, archivos externos o ausentes y respaldos antiguos; el resumen CLI no debe mostrar contenido sensible.
2. Incorporar la lectura y el inventario al runner; documentar las limitaciones de los originales.
3. Implementar persistencia, transferencia idempotente, consulta y visualización; probar aislamiento, fallos y reintentos en Miniflare.
4. Verificar compilaciones y runner empaquetado. La nueva ejecución de revisiones es una fase posterior, no está incluida en esta migración.

**Gestión de revisiones:** marcar la eliminación antes de borrar objetos, conservar el recibo y permitir reintentos si R2 falla. Durante ese estado no aceptar cargas. Los originales que faltaban podrán adjuntarse por el usuario con una operación idempotente; no se sustituirán archivos existentes. Probar concurrencia con eliminación, recuperación, aislamiento y reimportación.

**Estado:** lectura, transferencia reintentable, consulta histórica, adjunto de originales ausentes y eliminación reintentable implementados, con aislamiento por cuenta y recibo para evitar recreaciones. Las rutas de originales fuera del respaldo no se leen. Queda pendiente la ejecución de nuevas revisiones. La presentación histórica conserva todas las tablas, pero aún no reproduce los controles especializados del escritorio.
