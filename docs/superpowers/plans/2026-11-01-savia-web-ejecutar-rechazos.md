# Ejecutar revisiones de rechazo con Pi

**Objetivo:** permitir nuevas revisiones de rechazo desde la web con paridad progresiva con el escritorio, usando Pi en el runner local y la credencial autorizada de OpenCode Go.

**Diseño:** reutilizar el flujo de escritorio de extracción de criterios y sus comprobaciones de rechazo, ortografía y lógica, adaptando sus solicitudes para que cada ronda se ejecute mediante Pi. Los documentos se descargan con la concesión activa y se procesan temporalmente. Las opciones y criterios se seleccionan explícitamente; los errores por sección se conservan. El reporte completo se guarda por tarea en la nube y se presenta como revisable. No se cambia de proveedor ni se activa cómputo alojado.

1. Probar el adaptador Pi y el motor de escritorio con respuestas simuladas, selección de opciones, hallazgos verificables, cancelación, aislamiento y limpieza.
2. Implementar y probar el motor en el runner empaquetado. La prueba simulada no valida calidad ni acceso real al proveedor.
3. Conectar cola, credenciales, consentimiento, informe durable e interfaz para criterios y opciones; probar concesiones y aislamiento en Miniflare.
4. Validar compilaciones y el recorrido completo; revisar visualmente cuando el navegador esté disponible.

**Estado:** la web permite extraer criterios como tarea separada, editarlos y ejecutar las comprobaciones seleccionadas con consentimiento y credencial de OpenCode Go. El runner reutiliza el flujo de escritorio mediante Pi, serializa las rondas y guarda el informe con redacción de credenciales. Las pruebas cubren concesión, aislamiento, cancelación, resultados parciales, tipos MIME y herramientas reales de Pi con respuestas de proveedor simuladas; también pasan con el runner empaquetado. Las pruebas con una credencial real, la revisión visual y la paridad completa de controles y exportación siguen pendientes.
