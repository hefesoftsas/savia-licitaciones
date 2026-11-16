# Revisión anónima con Pi

**Objetivo:** ofrecer la segunda revisión del escritorio con el runner local y conservar los resultados programáticos si la revisión de Pi falla.

**Diseño:** la tarea acepta revisión Pi opcional con consentimiento explícito, credencial del cliente y pliego opcional; el DOCX y el pliego se obtienen solo bajo la concesión de la tarea. Se reutilizan el dump OpenXML, el protocolo de evidencia y el agente de escritorio. El informe distingue revisión omitida, terminada y fallida; no incluye credenciales. No se habilita ningún runner alojado ni proveedor fuera de la política del proyecto.

1. Probar consentimiento, aislamiento, resultado Pi validado y preservación ante error con el helper real y un runtime simulado.
2. Adaptar el agente al espacio temporal del runner y la API a las fuentes y la credencial seleccionadas.
3. Agregar a la interfaz controles explícitos, mostrar el estado y los resultados de la segunda revisión, y proteger los cambios.
4. Verificar con Miniflare, el CLI empaquetado y compilaciones; señalar falta de pruebas con proveedor real y revisión visual.

**Verificación:** Miniflare probó consentimiento, credencial, pliego, aislamiento y resultados con helper real y runtime Pi simulado; también se comprobó la conservación del informe local ante error y cierre fallido. El recorrido pasó usando el módulo y CLI empaquetados en macOS ARM. Compilaron las versiones de escritorio y web. Pendientes: prueba con proveedor real, inspección visual interactiva, soporte visual de imágenes para la revisión y continuidad de sesión para la reparación automática.
