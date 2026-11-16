# Oportunidades sugeridas: plan

**Objetivo:** buscar periódicamente oportunidades públicas y recomendar las relacionadas con el perfil y el RUP revisado, sin prometer elegibilidad.

**Diseño:** un servicio del proceso principal consulta SECOP mientras Savia está abierta, usando términos limitados del perfil o configurados por el usuario y coincidencias de clase UNSPSC revisadas. SQLite conserva preferencias, fecha, errores y resultados; la interfaz explica el motivo y permite abrir la oportunidad. El agente Pi con OpenCode Go analiza los candidatos cada seis horas y por demanda; ante falta de perfil se pide completarlo, y ante un fallo se conservan los resultados anteriores.

**Condiciones:** solo datos abiertos de SECOP, sin GPU ni OpenRouter; mostrar alcance limitado, fecha, procedencia y estado; evitar búsquedas simultáneas, proteger el proyecto actual y respetar es/en y ventana pequeña. El equipo apagado o la app cerrada no hacen búsquedas.

- [x] Implementar y probar consulta, deduplicación y análisis por Pi con OpenCode Go; conservar resultados previos ante fallos.
- [x] Integrar persistencia local, ciclo de vida del servicio y bridge con migración y schema sincronizado.
- [x] Crear pantalla responsive con configuración de términos, pausa, estado, búsqueda manual y apertura del proceso; intervalo de seis horas indicado por el usuario.
- [x] Probar reinicio, errores de red, perfil vacío, datos RUP, navegación, concurrencia y compilación; verificar visualmente en Electron.

La prueba real usó un perfil de ejemplo, consultas públicas y el modelo OpenCode Go configurado; se ejecutó en un directorio temporal aislado. Las pruebas de error y de programación usan dependencias simuladas.

Las búsquedas programadas y por demanda consultan de nuevo SECOP en lugar de reutilizar la caché de resultados; los selectores conservan su caché independiente. Una respuesta incompleta o con formato inesperado se trata como error y conserva las sugerencias anteriores. El límite de 50 resultados por término y fuente sigue siendo deliberado y se comunica en la interfaz; no implica cobertura exhaustiva.

La lista excluye estados finales observados en los conjuntos oficiales, incluidos «Seleccionado» en SECOP II y «Celebrado», «Liquidado», «Descartado» y estados terminados en SECOP I. Los estados ambiguos se mantienen para revisión. Una oportunidad con cierre verificado se descarta solo después de finalizar su fecha en Bogotá; una fecha sin procedencia verificada no se usa para descartarla. La fecha y el estado siempre requieren contraste con el expediente oficial.

El agente solo recibe la fecha de cierre cuando su procedencia está verificada; los valores sin verificar permanecen disponibles en la interfaz con su advertencia. También se indica al agente que no suponga fechas ausentes. Una prueba inspecciona el archivo de entrada entregado a Pi.
