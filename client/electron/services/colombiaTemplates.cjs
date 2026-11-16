const { cloneDefaultExportFormat } = require('./exportFormatDefaults.cjs');

const SOURCES = {
  offers: 'https://www.colombiacompra.gov.co/base-conocimiento/presentar-ofertas-secop-ii',
  experience: 'https://relatoria.colombiacompra.gov.co/conceptos/c-1609-de-2025/',
  economic: 'https://relatoria.colombiacompra.gov.co/conceptos/c-352-de-2025/',
  models: 'https://e-desarrollo.gov.co/transparencia/contratacion/formatos-y-documentos/',
};

// Savia layouts, not typography requirements imposed by Colombian law.
function colombiaFormat(name, landscape = false) {
  const config = cloneDefaultExportFormat();
  config.template_name = name;
  Object.assign(config.page, {
    paper_size: 'letter', orientation: landscape ? 'landscape' : 'portrait', two_column: false,
    margin_top_cm: 2.5, margin_bottom_cm: 2.5, margin_left_cm: 2.5, margin_right_cm: 2.5,
    header_enabled: false, footer_enabled: false, first_page_different: false,
    page_number_enabled: true, page_number_format: 'Página {page}', header_footer_style: 'plain',
    header_font: 'Arial', footer_font: 'Arial', header_color: '#000000', footer_color: '#000000',
  });
  config.heading_level1_page_break_before = false;
  config.heading_border.enabled = false;
  config.headings = config.headings.map((h, i) => ({ ...h, font: 'Arial', size: i === 0 ? '14' : '12', bold: true,
    text_color: '#000000', alignment: '左对齐', first_line_indent_chars: 0,
    spacing_before_pt: 12, spacing_after_pt: 6, numbering_format: 'custom', numbering_template: '{full}' }));
  Object.assign(config.body_text, { font: 'Arial', size: '11', alignment: '左对齐', first_line_indent_chars: 0,
    line_spacing_mode: 'multiple', line_spacing_value: 1.15, list_indent_chars: 0 });
  Object.assign(config.table, { border_color: '#71717a', border_width: 0.5, cell_padding_pt: 5,
    full_width: true, caption_font: 'Arial', caption_size: '10' });
  for (const role of ['header_row', 'first_column', 'body_cell']) Object.assign(config.table[role], {
    font: 'Arial', size: '10', alignment: '左对齐', text_color: '#000000', background_color: role === 'header_row' ? '#f4f4f5' : '#ffffff',
  });
  Object.assign(config.image, { caption_font: 'Arial', caption_size: '10' });
  return config;
}

const COLOMBIA_EXPORT_TEMPLATES = [
  { template_id: 'tpl-co-propuesta', config: colombiaFormat('Colombia · Propuesta técnica') },
  { template_id: 'tpl-co-anexos', config: colombiaFormat('Colombia · Anexos y cartas') },
  { template_id: 'tpl-co-matrices', config: colombiaFormat('Colombia · Matrices horizontales', true) },
];
Object.assign(COLOMBIA_EXPORT_TEMPLATES[1].config.body_text, { size: '12', line_spacing_value: 1.5 });

const context = '<p>Entidad: [ENTIDAD CONTRATANTE]</p><p>Proceso: [NÚMERO DEL PROCESO]</p><p>Objeto: [OBJETO DEL PROCESO]</p><p>Proponente: [NOMBRE / RAZÓN SOCIAL] · Identificación: [TIPO Y NÚMERO / NIT]</p><p>Fecha: [DÍA / MES / AÑO]</p>';
const signature = '<p>Firma: [FIRMA DE QUIEN CORRESPONDA]</p><p>Nombre: [NOMBRE COMPLETO] · Calidad: [CARGO / REPRESENTACIÓN]</p>';
const table = headings => `<table><thead><tr>${headings.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody><tr>${headings.map(() => '<td>[DILIGENCIAR]</td>').join('')}</tr></tbody></table>`;
const definition = (id, name, nameEn, summary, summaryEn, source, body, landscape = false) => ({
  id, name, nameEn, summary, summaryEn, source, reviewedAt: '2026-10-29',
  html: `<h1>${name}</h1><p>MODELO DE TRABAJO SAVIA · Adaptar a los requisitos y anexos del proceso. No es un formato oficial.</p>${context}${body}${signature}<p>Fuente de referencia: ${source} · Consulta: 29/10/2026.</p>`,
  config: colombiaFormat(name, landscape),
});

const COLOMBIA_DOCUMENT_TEMPLATES = [
  definition('co-presentacion', 'Carta de presentación de la oferta', 'Bid cover letter',
    'Identificación, alcance, anexos y firma del proponente.', 'Bidder identification, scope, attachments and signature.', SOURCES.offers,
    '<p>Señores [ENTIDAD CONTRATANTE]:</p><p>[NOMBRE], en calidad de [CALIDAD EN QUE ACTÚA] de [PROPONENTE], presenta la oferta para el proceso identificado anteriormente.</p><h2>Alcance de la propuesta</h2><p>[DESCRIBIR EL ALCANCE, EL PLAZO Y LAS CONDICIONES OFRECIDAS SEGÚN EL PLIEGO]</p><h2>Declaraciones exigidas</h2><p>[INCORPORAR LAS DECLARACIONES EXACTAS DEL FORMATO EXIGIDO Y VERIFICARLAS ANTES DE FIRMAR. NO DAR POR ACREDITADO SU CUMPLIMIENTO]</p><h2>Documentos adjuntos</h2>'+table(['Documento / anexo', 'Archivo', 'Observación'])+'<h2>Notificaciones</h2><p>Dirección: [DIRECCIÓN] · Correo: [CORREO] · Teléfono: [TELÉFONO]</p>'),
  definition('co-experiencia', 'Relación de experiencia del proponente', 'Bidder experience schedule',
    'Contratos, participación, RUP y soportes por requisito.', 'Contracts, participation, RUP references and supporting evidence.', SOURCES.experience,
    '<p>Usar el formato exigido por la entidad cuando corresponda. Esta matriz ayuda a preparar la información; no acredita por sí sola la experiencia.</p>'+table(['Contrato / contratante', 'Objeto / actividad', 'Fechas de ejecución', 'Valor y moneda', 'Integrante y participación', 'Consecutivo RUP (si aplica)', 'Soporte / requisito'])+'<h2>Verificación</h2><p>[RELACIONAR CERTIFICADOS, ACTAS Y OTROS SOPORTES EXIGIDOS; COMPROBAR FECHAS, VALORES, PARTICIPACIÓN Y REGLAS DE CONVERSIÓN DEL PROCESO]</p>', true),
  definition('co-equipo', 'Equipo de trabajo propuesto', 'Proposed project team',
    'Perfiles, dedicación, experiencia y disponibilidad por rol.', 'Roles, time allocation, qualifications and availability.', SOURCES.models,
    table(['Rol exigido', 'Persona propuesta', 'Formación / matrícula', 'Experiencia requerida', 'Dedicación', 'Soportes'])+'<h2>Disponibilidad y compromisos</h2><p>[ADJUNTAR LOS COMPROMISOS INDIVIDUALES Y SOPORTES QUE EXIJA EL PROCESO. NO SUPONER LA DISPONIBILIDAD NI LA AUTORIZACIÓN DE TERCEROS]</p>', true),
  definition('co-metodologia', 'Metodología y plan de trabajo', 'Methodology and work plan',
    'Actividades, entregables, cronograma y control de calidad.', 'Activities, deliverables, schedule and quality control.', SOURCES.models,
    '<h2>Comprensión del objeto y alcance</h2><p>[VINCULAR EL ALCANCE PROPUESTO CON LOS REQUISITOS TÉCNICOS DEL PROCESO]</p><h2>Metodología de ejecución</h2><p>[DESCRIBIR FASES, ACTIVIDADES, RESPONSABILIDADES Y RECURSOS]</p><h2>Cronograma y entregables</h2>'+table(['Fase / actividad', 'Entregable', 'Responsable', 'Inicio / fin', 'Criterio de aceptación'])+'<h2>Calidad y seguimiento</h2><p>[DEFINIR CONTROLES, REGISTROS, INDICADORES Y MECANISMOS DE SEGUIMIENTO]</p><h2>Riesgos y dependencias</h2>'+table(['Riesgo / dependencia', 'Medida propuesta', 'Responsable'])+'<h2>Matriz de cumplimiento técnico</h2>'+table(['Requisito del pliego', 'Respuesta / sección', 'Soporte', 'Pendiente'])),
  definition('co-economica', 'Oferta económica de referencia', 'Reference price proposal',
    'Precios, cantidades e impuestos para preparar el anexo económico.', 'Prices, quantities and taxes for preparing the financial attachment.', SOURCES.economic,
    '<p>Trasladar los valores al formulario de la entidad y a SECOP cuando corresponda. No modificar unidades, cantidades ni reglas de cálculo exigidas por el proceso.</p>'+table(['Ítem', 'Descripción', 'Unidad', 'Cantidad', 'Precio unitario (COP)', 'Impuestos aplicables', 'Total (COP)'])+'<p>Subtotal: [CALCULAR] · Impuestos: [DEFINIR Y CALCULAR] · Total: [CALCULAR]</p><p>Este documento no calcula valores automáticamente. Verificar operaciones, redondeos e inclusión de impuestos según el proceso.</p><h2>Condiciones económicas</h2><p>Vigencia de la oferta: [SEGÚN EL PROCESO]</p><p>Forma de pago: [SEGÚN EL PROCESO]</p><p>[ACLARAR COSTOS INCLUIDOS Y OTROS CONCEPTOS SOLO CUANDO EL PLIEGO LO PERMITA]</p>', true),
];

module.exports = { COLOMBIA_DOCUMENT_TEMPLATES, COLOMBIA_EXPORT_TEMPLATES };
