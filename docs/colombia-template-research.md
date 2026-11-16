# Plantillas para licitaciones colombianas

Investigación: 29 de octubre de 2026. Estado: catálogo implementado y validado. Se adoptó la alternativa de formatos y documentos editables como decisión de implementación tras no recibir una preferencia.

## Situación del producto

`client/electron/services/systemExportTemplates.cjs` define tres plantillas de presentación. Se sincronizan con `export_templates` mediante `templateStore.syncSystemTemplates()`. El usuario puede verlas, duplicarlas y modificar su formato desde `MyTemplatesPage.tsx` y seleccionarlas en la generación de documentos. Los registros actuales contienen configuración de página, encabezados, párrafos, tablas e imágenes; no contienen modelos de cartas ni formularios de oferta.

Por tanto, añadir nombres colombianos a estos tres formatos no implementa documentos editables para presentar una oferta. Son dos capacidades distintas.

## Fuentes consultadas

- Colombia Compra Eficiente, [Presentar ofertas – SECOP II](https://www.colombiacompra.gov.co/base-conocimiento/presentar-ofertas-secop-ii): el proceso contiene los documentos complementarios y requisitos; deben revisarse sus adendas. La oferta económica también se diligencia en la plataforma. Sirve como referencia del flujo, no como licencia para sustituir anexos específicos.
- Colombia Compra Eficiente, [Documentos Tipo](https://www.colombiacompra.gov.co/normativa-y-relatoria/documentos-tipo): punto de entrada para los documentos sectoriales. La extracción disponible de esta página no permitió verificar archivos descargables ni versiones de cada paquete; no asumir que se descargaron o que se incorporaron modelos oficiales vigentes.
- Colombia Compra Eficiente, [Concepto C-1609 de 2025](https://relatoria.colombiacompra.gov.co/conceptos/c-1609-de-2025/): referencia para los campos de experiencia, incluido consecutivo del contrato en RUP e integrante que aporta la experiencia cuando corresponde.
- Colombia Compra Eficiente, [Concepto C-352 de 2025](https://relatoria.colombiacompra.gov.co/conceptos/c-352-de-2025/): distingue el presupuesto de la entidad y la propuesta económica del oferente en el Formulario 1 de infraestructura de transporte. No tratar una tabla genérica de precios como el formulario obligatorio de cualquier proceso.
- E-Desarrollo, [Formatos y documentos de contratación](https://e-desarrollo.gov.co/transparencia/contratacion/formatos-y-documentos/): catálogo público con cartas de presentación, experiencia, personal, equipos, calidad y certificaciones. La propia página indica que son referencias y que la versión aplicable se publica con cada convocatoria. Sus modalidades y régimen no deben generalizarse a toda la contratación colombiana.

## Alternativas a resolver con el usuario

1. **Formatos de presentación:** ampliar los presets de exportación con una presentación sobria para propuesta técnica, una presentación compacta para anexos y tablas, y una presentación para metodología y cronograma. Fuentes latinas, numeración decimal, títulos en español, márgenes configurables. Las decisiones tipográficas son de Savia y no se presentarán como exigencias legales.
2. **Documentos editables:** incorporar un catálogo de modelos con campos pendientes y fuentes: carta de presentación, relación de experiencia, equipo de trabajo, metodología/plan de trabajo y oferta económica de referencia. Requiere contenido real, vista previa, creación de copias editables y exportación, no solo estilos.
3. **Ambos (recomendado):** mantener separados los estilos de exportación y los modelos de contenido dentro de Plantillas. Reutilizar la infraestructura local y el editor/exportador existente.

No rellenar automáticamente declaraciones, acreditaciones, firmas, importes o cumplimiento. No asignar logos oficiales a modelos creados por Savia. Los archivos oficiales incorporados en el futuro deben conservar procedencia, versión y alcance; no afirmar que una adaptación es un formato oficial.

## Verificación de la implementación pendiente

- El catálogo debe estar accesible desde Plantillas, con nombres y acciones en español e inglés.
- Los modelos deben tener fuentes consultables y distinguir referencia de formato oficial.
- Crear una copia debe conservar el modelo base y permitir editar el contenido de la copia.
- Validar exportación DOCX y PDF con contenido real, tablas largas y campos sin diligenciar visibles.
- Comprobar funcionamiento local sin solicitudes de red para usar los modelos incluidos.
- Preservar plantillas personales y referencias a presets existentes.
- Ejecutar build, pruebas focalizadas de catálogo/persistencia y comprobación del flujo en Electron antes de declarar terminado el objetivo.


## Implementación

- Cinco modelos originales de trabajo, con campos explícitos y fuente: carta de presentación, experiencia, equipo, metodología y oferta económica.
- Tres nuevos estilos: propuesta técnica en carta, anexos/cartas con cuerpo de 12 puntos y matrices horizontales. Se mantienen los tres presets previos.
- Catálogo local servido desde Main mediante `templates:colombia`; vista previa de contenido con el renderizador compartido de Savia y acciones de exportación existentes.
- Copia DOCX mediante el exportador Open XML. Edición y PDF mediante LibreOffice local. Si falta el motor, sigue disponible la copia Word.
- No hay descargas automáticas, modificaciones a las plantillas personales ni cambios al esquema SQLite.
- `check-colombia-templates.cjs` genera los cinco documentos con el servicio real y verifica contenido, tablas y conservación del modelo.
- `check-colombia-ui.cjs` comprueba el catálogo en el build de Electron, la copia Word y el recorrido LibreOffice/PDF en un perfil temporal.


## Evidencia de validación

- Build TypeScript/Vite: correcto.
- Generación Open XML de los cinco modelos: correcta; tablas nativas, campos pendientes, títulos y conservación de originales comprobados.
- Electron con perfil temporal: catálogo de cinco modelos y seis estilos visible; copia Word desde el botón del catálogo; apertura en LibreOffice y exportación PDF con conexiones externas bloqueadas: correctas.
- PDF de carta de presentación: una página, texto y tabla visibles, pie separado; revisión visual realizada.
- Matriz de experiencia con 90 contratos: PDF de 26 páginas; se verificaron los 90 identificadores y que la franja inferior de todas las páginas contiene solo la numeración. Los renglones largos pueden continuar en la página siguiente, con cabecera repetida.
- Catálogo y diálogo comprobados a 1280, 640 y 390 píxeles. Las acciones permanecen dentro de la ventana y el contenido tiene desplazamiento interno.
- La revisión visual detectó una vista previa inicialmente en blanco con iframe. Se sustituyó por MarkdownRenderer para contenido local del catálogo, con HTML habilitado explícitamente; nueva revisión visual correcta en escritorio y ventana pequeña.
- Build final y prueba de interfaz tras la corrección: correctos.
