# Certificado y comparación RUP en Savia web

1. Almacenar un certificado PDF por cuenta con copias históricas inmutables para conservar fuentes de comparaciones; validar que el PDF abra y tenga páginas. La sustitución exige versión para evitar sobrescribir cambios de otra sesión.
2. Permitir registrar, editar y eliminar datos revisados, vinculados a la versión actual del certificado y a una página válida. Las mutaciones validan versión del certificado y del dato; no comparten datos entre usuarios.
3. Conectar la sección de credenciales en web, con visualización del PDF y manejo de conflictos. La extracción automática y Pi se incorporan después; no simularlos.
4. Agregar comparación versionada de un requisito y un dato revisado, con interpretación explícita de números ambiguos, fuente guardada y detección de datos obsoletos. Reutilizar las reglas numéricas y la exportación del escritorio.
5. Probar persistencia, sustitución, aislamiento, concurrencia y comportamiento del runner en Miniflare. El certificado es una copia aportada por el usuario; no verifica vigencia ni autenticidad.

## Comparación RUP

- `GET/PUT /api/projects/:id/workflow/requirements/:id/rup-comparison` devuelve o guarda la instantánea con versión. El guardado verifica versión del requisito, certificado y dato, y registra la lista de documentos del proyecto; una actualización concurrente produce 409.
- La instantánea conserva el PDF original, página, fecha, valor, interpretación, regla, umbral, título y fuente. Se marca desactualizada si cualquiera de esas fuentes o la lista de documentos cambia; la valoración humana no se modifica.
- La interfaz usa las mismas reglas numéricas del escritorio, exige interpretación explícita para cifras ambiguas, enlaza el PDF original y avisa que la comparación no determina habilitación. CSV y Excel incluyen la instantánea y su estado.

## Análisis de RUP con Pi

- El RUP pertenece a la cuenta, no a un proyecto. Agregar una cola de tareas de cuenta que reutilice concesiones, recuperación y credenciales del runner sin crear proyectos ficticios.
- `rup.analyze` requiere consentimiento explícito, versión e identificador del certificado y credencial OpenCode Go propia. El runner obtiene el PDF solo con su concesión; si el certificado o su fecha cambian, el servidor rechaza el acceso.
- Reutilizar `rupAgentService.cjs`, el parser local y las herramientas Pi de solo lectura; verificar citas y páginas contra el texto extraído y conservar únicamente sugerencias revisables, sin cambiar datos guardados.
- Mostrar los trabajos y sugerencias en Modelo y RUP. Copiar una sugerencia al formulario solo tras revisión humana; impedir guardarla contra un certificado distinto. Cancelar y recuperar resultados usan el protocolo existente. Probar con modelo simulado y sin red externa.
