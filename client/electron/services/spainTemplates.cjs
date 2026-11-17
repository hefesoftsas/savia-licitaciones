const { cloneDefaultExportFormat } = require('./exportFormatDefaults.cjs');

const SOURCES = {
  lcsp: 'https://www.boe.es/buscar/act.php?id=BOE-A-2017-12902',
  placsp: 'https://contrataciondelestado.es/',
  rolece: 'https://registrodelicitadores.gob.es/',
  deuc: 'https://visor.registrodelicitadores.gob.es/',
};

// Savia working layouts for Spanish public tenders (A4, Latin typography, Western numbering).
function spainFormat(name, landscape = false, font = 'Calibri') {
  const config = cloneDefaultExportFormat();
  config.template_name = name;
  Object.assign(config.page, {
    paper_size: 'a4',
    orientation: landscape ? 'landscape' : 'portrait',
    two_column: false,
    margin_top_cm: 2.5,
    margin_bottom_cm: 2.5,
    margin_left_cm: 2.5,
    margin_right_cm: 2.5,
    header_enabled: false,
    footer_enabled: false,
    first_page_different: false,
    page_number_enabled: true,
    page_number_format: 'Página {page}',
    header_footer_style: 'plain',
    header_font: font,
    footer_font: font,
    header_color: '#000000',
    footer_color: '#000000',
  });
  config.heading_level1_page_break_before = false;
  config.heading_border.enabled = false;
  config.headings = config.headings.map((h, i) => ({
    ...h,
    font: 'Arial',
    size: i === 0 ? '14' : i === 1 ? '12' : '11',
    bold: true,
    text_color: '#000000',
    alignment: '左对齐',
    first_line_indent_chars: 0,
    spacing_before_pt: 12,
    spacing_after_pt: 6,
    numbering_format: 'custom',
    numbering_template: '{full}',
  }));
  Object.assign(config.body_text, {
    font,
    size: '11',
    alignment: '左对齐',
    first_line_indent_chars: 0,
    line_spacing_mode: 'multiple',
    line_spacing_value: 1.15,
    list_indent_chars: 0,
  });
  Object.assign(config.table, {
    border_color: '#71717a',
    border_width: 0.5,
    cell_padding_pt: 5,
    full_width: true,
    caption_font: font,
    caption_size: '10',
  });
  for (const role of ['header_row', 'first_column', 'body_cell']) {
    Object.assign(config.table[role], {
      font,
      size: '10',
      alignment: '左对齐',
      text_color: '#000000',
      background_color: role === 'header_row' ? '#f4f4f5' : '#ffffff',
    });
  }
  Object.assign(config.image, { caption_font: font, caption_size: '10' });
  return config;
}

const SPAIN_EXPORT_TEMPLATES = [
  { template_id: 'tpl-es-memoria-tecnica', config: spainFormat('España · Memoria técnica (A4)') },
  { template_id: 'tpl-es-sobre-a-administrativo', config: spainFormat('España · Sobre A y anexos LCSP') },
  { template_id: 'tpl-es-matrices', config: spainFormat('España · Matrices horizontales (A4)', true) },
];
Object.assign(SPAIN_EXPORT_TEMPLATES[1].config.body_text, { size: '12', line_spacing_value: 1.5 });

const context = '<p>Órgano de contratación: [ÓRGANO DE CONTRATACIÓN]</p><p>Expediente: [NÚMERO DE EXPEDIENTE] · Lote: [LOTE / NO DIVISIÓN]</p><p>Objeto del contrato: [OBJETO DEL CONTRATO] · CPV: [CÓDIGO(S) CPV]</p><p>Licitador: [RAZÓN SOCIAL] · NIF/CIF: [NIF/CIF] · ROLECE/RELI: [N.º INSCRIPCIÓN / NO INSCRITO]</p><p>Fecha: [DÍA / MES / AÑO]</p>';
const signature = '<p>Firma electrónica: [FIRMA DEL REPRESENTANTE LEGAL]</p><p>Nombre y apellidos: [NOMBRE COMPLETO] · Cargo / Poder: [CARGO / REPRESENTACIÓN]</p>';
const table = headings => `<table><thead><tr>${headings.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody><tr>${headings.map(() => '<td>[CUMPLIMENTAR]</td>').join('')}</tr></tbody></table>`;
const definition = (id, name, nameEn, summary, summaryEn, source, body, landscape = false) => ({
  id,
  name,
  nameEn,
  summary,
  summaryEn,
  source,
  reviewedAt: '2026-11-17',
  html: `<h1>${name}</h1><p>MODELO DE TRABAJO SAVIA (LCSP Ley 9/2017) · Adaptar al PCAP, Cuadro de Características y anexos oficiales del expediente. No sustituye a los modelos oficiales.</p>${context}${body}${signature}<p>Fuente de referencia: ${source} · Consulta: 17/11/2026.</p>`,
  config: spainFormat(name, landscape),
});

const SPAIN_DOCUMENT_TEMPLATES = [
  definition(
    'es-sobre-a-deuc',
    'Sobre A · Documentación administrativa y DEUC',
    'Envelope A · Administrative docs & ESPD (DEUC)',
    'Lista de comprobación LCSP: DEUC, ROLECE/RELI, capacidad de obrar, prohibiciones y solvencia.',
    'LCSP checklist: ESPD (DEUC), ROLECE/RELI, capacity to contract, exclusions and solvency.',
    SOURCES.deuc,
    '<p>Declaración responsable ajustada al formulario normalizado del Documento Europeo Único de Contratación (DEUC, art. 140 LCSP) y documentación previa del Sobre A / archivo electrónico único.</p>' +
      '<h2>1. Identificación y representación del licitador</h2>' +
      '<p>Razón social: [RAZÓN SOCIAL] · NIF/CIF: [NIF/CIF] · Domicilio social: [DIRECCIÓN] · Correo de notificaciones (DEHú / PLACSP): [CORREO]</p>' +
      '<p>Inscripción en registro oficial: [ROLECE / RELI / NO INSCRITO] · Clasificación empresarial (si aplica): [GRUPO / SUBGRUPO / CATEGORÍA]</p>' +
      '<h2>2. Declaraciones obligatorias (PCAP)</h2>' +
      table(['Documento / declaración exigida', 'Normativa / cláusula PCAP', 'Archivo / formato', 'Estado']) +
      '<h2>3. Solvencia y adscripción de medios</h2>' +
      '<p>[INDICAR SI SE ACREDITA MEDIANTE CLASIFICACIÓN EMPRESARIAL O MEDIANTE SOLVENCIA ECONÓMICA, FINANCIERA Y TÉCNICA CONFORME AL CUADRO DE CARACTERÍSTICAS; VERIFICAR UTE O INTEGRACIÓN DE MEDIOS EXTERNOS (ART. 75 LCSP)]</p>',
  ),
  definition(
    'es-memoria-tecnica',
    'Sobre B · Memoria técnica (juicio de valor)',
    'Envelope B · Technical proposal (value judgment)',
    'Metodología, plan de trabajo y cumplimiento del PPT sin incluir datos evaluables por fórmulas.',
    'Methodology, work plan and PPT compliance without Sobre C formula/price information.',
    SOURCES.lcsp,
    '<p>ADVERTENCIA ART. 146.2 LCSP: Si los criterios sujetos a juicio de valor se evalúan en Sobre B separado, NO incluir importes de oferta económica, porcentajes de baja ni datos cuantitativos evaluables automáticamente en el Sobre C.</p>' +
      '<h2>1. Comprensión del objeto y alcance del PPT</h2><p>[VINCULAR LA PROPUESTA TÉCNICA CON LAS PRESCRIPCIONES TÉCNICAS DEL PPT Y EL LOTE CORRESPONDIENTE]</p>' +
      '<h2>2. Metodología de ejecución y organización del servicio</h2><p>[DESCRIBIR FASES, PROCESOS, ENTREGABLES, PROTOCOLOS DE CALIDAD Y MEDIOS MATERIALES]</p>' +
      '<h2>3. Planificación y cronograma</h2>' +
      table(['Fase / hito', 'Entregable', 'Responsable', 'Plazo / semana', 'Indicador de seguimiento']) +
      '<h2>4. Control de calidad, gestión de riesgos y ANS</h2>' +
      table(['Riesgo / incidencia', 'Medida preventiva / correctiva', 'Nivel de servicio (ANS)']) +
      '<h2>5. Matriz de trazabilidad con el PPT</h2>' +
      table(['Cláusula / requisito PPT', 'Apartado de la memoria', 'Cumplimiento', 'Observaciones']),
  ),
  definition(
    'es-solvencia-equipo',
    'Solvencia técnica, experiencia y equipo adscrito',
    'Technical solvency, track record & assigned team',
    'Relación de principales contratos (CPV, importes EUR sin IVA) y perfiles del equipo.',
    'Schedule of main contracts (CPV, EUR excl. VAT) and assigned project team profiles.',
    SOURCES.rolece,
    '<p>Relación de los principales servicios, suministros u obras ejecutados en el periodo exigido por el PCAP (art. 88–90 LCSP), junto con los certificados de buena ejecución expedidos por el órgano competente.</p>' +
      '<h2>1. Relación de contratos ejecutados</h2>' +
      table(['Órgano / entidad contratante', 'Objeto y código CPV', 'Fechas inicio / fin', 'Importe sin IVA (EUR)', '% Participación (UTE)', 'Certificado / soporte']) +
      '<h2>2. Equipo humano adscrito a la ejecución</h2>' +
      table(['Perfil exigido (PPT/PCAP)', 'Persona propuesta', 'Titulación / habilitación', 'Experiencia acreditada', 'Dedicación (%)', 'Documentación']) +
      '<h2>3. Verificación</h2><p>[COMPROBAR CERTIFICADOS DE BUENA EJECUCIÓN, COINCIDENCIA DE CPV, UMBRALES DE SOLVENCIA DEL CUADRO DE CARACTERÍSTICAS Y COMPROMISOS DE ADSCRIPCIÓN DE MEDIOS (ART. 76.2 LCSP)]</p>',
    true,
  ),
  definition(
    'es-oferta-economica',
    'Sobre C · Oferta económica y criterios automáticos',
    'Envelope C · Financial bid & formula criteria',
    'Proposición económica en EUR (base imponible, IVA y total) y criterios evaluables por fórmulas.',
    'Financial proposal in EUR (net, VAT and total) and formula-based award criteria.',
    SOURCES.placsp,
    '<p>Trasladar exactamente los importes al modelo de proposición económica del anexo del PCAP y a la plataforma de licitación electrónica (PLACSP / portal autonómico). No superar el Presupuesto Base de Licitación (PBL).</p>' +
      table(['Concepto / lote', 'Unidad', 'Cantidad', 'Precio unitario sin IVA (EUR)', 'Base imponible (EUR)', 'Tipo IVA (%)', 'Cuota IVA (EUR)', 'Total con IVA (EUR)']) +
      '<p>Presupuesto Base de Licitación (PBL) sin IVA: [IMPORTE EUR] · Valor Estimado del Contrato (VEC): [IMPORTE EUR]</p>' +
      '<p>Total oferta sin IVA: [CALCULAR EUR] · IVA: [CALCULAR EUR] · Total oferta con IVA: [CALCULAR EUR]</p>' +
      '<h2>Otros criterios evaluables mediante fórmulas</h2>' +
      table(['Criterio automático (PCAP)', 'Valor ofertado', 'Puntuación máxima', 'Observaciones']) +
      '<h2>Condiciones de la proposición</h2><p>Plazo de validez de la oferta: [SEGÚN PCAP] · Garantía definitiva prevista (5% adjudicación sin IVA, art. 107 LCSP): [VERIFICAR]</p>',
    true,
  ),
];

module.exports = { SPAIN_DOCUMENT_TEMPLATES, SPAIN_EXPORT_TEMPLATES };
