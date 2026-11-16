# Opciones pendientes

**Objetivo:** completar las cuatro opciones que actualmente muestran el aviso «En desarrollo», conservando los datos locales y los flujos existentes.

**Hallazgos:** la biblioteca de imágenes y la evaluación IA carecen de ruta de pantalla. Los alcances de respuesta completa y oferta comercial tienen valores persistidos y lógica parcial de catálogo, pero comparten pasos de puntuación técnica que deben revisarse antes de habilitarlos.

**Restricciones:** español e inglés, ventanas estrechas, persistencia en SQLite y archivos del espacio de trabajo; mantener los trabajos largos en Main. Para inferencia usar el agente existente con OpenCode Go, sin introducir OpenRouter ni servicios adicionales. No desactivar avisos hasta que cada flujo funcione.

## Entregas

- [x] Biblioteca de imágenes: importar originales, consultar, previsualizar y eliminar con confirmación; persistencia y recuperación tras reiniciar. Probar cancelación, duplicados, nombres Unicode y archivos inaccesibles.
- [x] Alcance de respuesta completa: comprobar análisis, selección de secciones, plantillas, generación y exportación con datos representativos; corregir los pasos incompletos antes de permitir la selección.
- [x] Alcance comercial: separar las reglas que dependen de la puntuación técnica y verificar que no incluya secciones técnicas por defecto; probar licitaciones con y sin puntuación técnica.
- [x] Evaluación IA: analizar los documentos de la oferta frente a los criterios de la licitación, conservar fuentes y evidencias, mostrar incertidumbres y permitir revisar el resultado; probar errores, interrupciones y recuperación. El resultado es una simulación, no una adjudicación.
- [x] Comprobar ambos idiomas y temas, tamaños de escritorio, IPC, persistencia y compilación; mantener las limitaciones explícitas cuando no sea posible probar inferencia real.

## Avance

- Biblioteca de imágenes: pantalla y servicio implementados. La prueba con Electron cubre importar una imagen, previsualizarla y eliminarla en español/claro e inglés/oscuro, además de cancelar el selector. El servicio se comprobó con nombres Unicode, duplicados, importación fallida sin resultados parciales, reapertura de SQLite y migración desde v49. Compilación y smoke nativo correctos.
- Oferta comercial: el catálogo ya no exige el análisis de puntuación técnica, omite su planificación y rechaza apartados técnicos en la salida inicial; preselecciona todos los apartados comerciales y respeta el modo de usar exclusivamente la propuesta original. Si no hay secciones para generar con IA, se puede avanzar sin generar hechos globales. Pruebas del agente simulado con y sin puntuación y prueba Electron de edición y persistencia de texto manual correctas. La opción ya se puede seleccionar y aclara que los precios y las firmas requieren revisión y diligenciamiento.
- Integración Word: la extracción asigna marcadores por ID confirmado, y la exportación copia los capítulos de la plantilla en el orden del catálogo. Se verificaron extracción y marcado reales, conservación de campos, edición insertada, imagen, estilo personalizado y texto manual, así como errores sin sobrescribir archivos y una exportación real con y sin marco. El proceso conserva los marcadores de la revisión de formato. Las plantillas antiguas sin marcadores generan una advertencia y se exportan como pendientes. Con Pi y OpenCode Go reales y un pliego sintético se extrajo el formulario de oferta, se editó un campo de la copia de prueba y se confirmó su presencia en el Word exportado. Una primera ejecución mostró que la regla anterior trataba el formulario de precios como texto manual; se corrigió para preservar formularios de precios sin inventar valores.
- La guía de desarrollo menciona `scripts/check-content-generation-agent.cjs`, pero ese archivo no existe en este checkout; su comprobación no pudo ejecutarse. La compilación y las pruebas dirigidas de catálogo y exportación sí pasaron.

## Evaluación de ofertas: diseño de trabajo

- Evaluar una oferta por ejecución, compuesta por uno o varios archivos, contra los documentos seleccionados de la licitación activa. Guardar los textos extraídos y cada resultado en SQLite por proyecto para poder revisarlos tras cerrar o cambiar de pantalla.
- Pi con OpenCode Go busca los criterios en el pliego y las evidencias en la oferta. Cada resultado debe identificar ambos documentos y aportar citas textuales verificables; las puntuaciones son propuestas para revisión humana, no decisiones de adjudicación. Un criterio sin máximo verificable o evidencia suficiente queda sin puntaje; no inventar un total completo ni convertir ausencia de texto extraído en incumplimiento.
- Importar con el parser local ya existente, conservar errores por archivo y advertir sobre archivos sin texto. Ejecutar y cancelar en Main, registrar interrupción al reiniciar y evitar que una respuesta tardía sustituya datos de otra ejecución o proyecto.
- Presentar criterios, citas, incertidumbres y puntajes propuestos en español e inglés, con acceso a fuentes y edición o revisión antes de exportar el informe. Probar documentos largos, citas inventadas, valores fuera de rango, cancelación, reinicio y cambio de proyecto; no requiere GPU.

- Evaluación IA: importación de una oferta con varios archivos, selección de pliegos, análisis en segundo plano con Pi y OpenCode Go, citas verificadas, revisión humana, historial por proyecto y exportación Markdown. La prueba real con archivos sintéticos comprobó el análisis, las citas, el guardado de revisión y el informe. Las pruebas de Electron cubren aislamiento entre proyectos, persistencia, cancelación, recuperación e interfaz en ambos idiomas y tamaños de ventana.

- Respuesta completa: prueba de extremo a extremo con Pi y OpenCode Go y pliego sintético: catálogo con sección técnica, datos generales, generación de contenido, conversión de secciones, formulario editado y exportación Word. Se comprobó que el texto generado y la edición del formulario están presentes en el archivo. La opción se probó seleccionable en español/claro e inglés/oscuro.
