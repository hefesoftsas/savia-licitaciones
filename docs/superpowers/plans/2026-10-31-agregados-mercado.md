# Agregados de mercado trazables

**Objetivo:** Resumir contratos publicados en SECOP II que coinciden con los filtros, aclarando población, período, fuente y límites.

- [x] Verificar en la fuente oficial tipos, cobertura, duplicados y semántica del valor; definir filtros y tratamiento de importes vacíos o moneda no identificada.
- [x] Consultar agregados en la fuente sobre la población filtrada, no solo sobre la página visible; incluir número de registros, período y conteo de importes utilizables. No insinuar resultados completos si hay límites o errores.
- [x] Presentar estadísticas, filtros y fecha de consulta junto al histórico, con acceso al origen y advertencia sobre cobertura y calidad; no presentarlos como predicción ni recomendación de precio.
- [x] Probar filtros compartidos, valores ausentes, errores, cifras reales representativas, formato es/en y UI responsive.

La fuente [SECOP II Contratos Electrónicos](https://www.datos.gov.co/Gastos-Gubernamentales/SECOP-II-Contratos/jbjy-vk9h) describe `valor_del_contrato` como valor total y no publica un campo de moneda. Se incluyen importes cero, se excluyen nulos de los cálculos y se muestran conteos de filas y de identificadores distintos por separado. En una consulta real de Palmira se obtuvieron 14.628 filas y 14.628 IDs distintos; esta muestra no demuestra ausencia de duplicados en el conjunto completo.

El histórico usa el identificador de fila de Socrata como último criterio de orden para desempatar contratos que comparten fecha e ID; la fuente aceptó ese orden en una consulta real. Esto no congela los datos: los registros pueden cambiar entre páginas y la interfaz lo indica, además de advertir sobre la caché.

La pantalla muestra los filtros que produjeron los resultados visibles, incluso si la persona edita el formulario sin volver a buscar. Si falla una búsqueda nueva, oculta los resultados y agregados de la consulta anterior para no atribuirlos a los filtros nuevos. Se verificaron el fallo y la presentación en español e inglés mediante Electron.

El 31 de octubre de 2026 se contrastó otra consulta pública real para `ORQUESTA FILARMONICA DE BOGOTA` con fecha de firma informada: el servicio devolvió 3.225 filas y 3.225 importes, con promedio 98.565.158,45116279. Una consulta independiente de cantidad y suma en el mismo conjunto dio el mismo conteo y promedio calculado. La fuente no identifica la moneda y los datos pueden cambiar; esto verifica esa consulta puntual, no la integridad ni exhaustividad de todos los contratos. También respondieron las búsquedas reales de histórico y Tienda Virtual filtradas por BOGOTA.
