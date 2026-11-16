# Borrador de oferta económica

**Objetivo:** Calcular y conservar por licitación un borrador editable con cantidades, costos, precios y porcentajes introducidos por la persona, sin proponer tasas fiscales ni decidir si la oferta es válida.

- [x] Definir aritmética decimal exacta, límites y redondeo por línea; probar cantidades fraccionarias, ceros, valores grandes y entradas inválidas.
- [x] Guardar el borrador por licitación en SQLite, con aislamiento, migración y limpieza al eliminar; calcular y exportar una copia CSV con la configuración y los resultados.
- [x] Integrar una interfaz responsive con etiquetas claras, porcentaje por línea introducido por la persona, comparación opcional con presupuesto y margen antes de impuestos; explicar qué se incluye y lo que requiere revisión humana.
- [x] Probar guardado, reapertura de SQLite, aislamiento, exportación, errores y UX es/en en Electron, además de compilación y smoke nativo.

La herramienta aplica un solo porcentaje sobre la base redondeada de cada línea; no calcula por separado retenciones, impuestos compuestos ni AIU. El costo es opcional y no hay margen si falta en alguna línea. El CSV usa punto decimal; se deben revisar los porcentajes y condiciones del pliego antes de usarlo.

El CSV incluye el identificador de la licitación y, cuando están disponibles, su referencia, entidad y título para distinguirlo de otras ofertas. Estos datos proceden de la licitación guardada y se neutralizan como texto al abrirlos en una hoja de cálculo; la exportación rechaza una licitación que ya no existe.

## Descuento por línea

Cada línea puede incluir un descuento porcentual opcional entre 0 y 100. Primero se redondea el importe bruto, después el descuento de esa línea; la base resulta de restarlo y sobre ella se aplica el recargo indicado. El costo no cambia y el margen sigue siendo base menos costo. Los borradores anteriores sin descuento conservan el cálculo anterior. La interfaz y el CSV deben mostrar el descuento, sus efectos y la regla de redondeo; validar límites, importes pequeños, persistencia y compatibilidad de borradores previos.
