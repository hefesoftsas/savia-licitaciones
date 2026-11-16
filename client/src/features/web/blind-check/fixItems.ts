import type { AppLocale } from '../../../shared/i18n';

/** Local display-text maps with zh fallback. Data file without hooks; localize using the lang parameter. */
type LocaleText = { es: string; en: string };
const pickLang = (lang: AppLocale, v: LocaleText): string => lang === "en" ? v.en : v.es;
const L = (es: string, en: string): LocaleText => ({ es, en });

export interface FixItem {
  ruleId: string;
  label: string;
  hint: string;
}

export interface FixGroup {
  id: string;
  title: string;
  description: string;
  items: FixItem[];
}

/** Automatic repair options grouped by identity, layout, and text structure; rule IDs match Main's FIX_RULE_IDS. */
const FIX_GROUP_RULES: Array<{ id: string; ruleIds: string[] }> = [
  { id: "identity", ruleIds: ["struct.doc_props", "struct.comment", "struct.revision", "text.hidden", "struct.hyperlink", "struct.field", "struct.header_footer", "image.meta", "struct.bookmark"] },
  { id: "format", ruleIds: ["page.paper_size", "page.margins", "page.columns", "page.background", "para.line_spacing", "para.first_line_indent", "para.space_before_after", "para.alignment", "font.chinese", "font.western", "font.size", "font.bold", "font.italic", "font.underline", "font.color", "font.highlight", "font.effects", "font.char_spacing", "font.scaling", "table.font", "table.size", "table.indent", "table.shading", "image.color"] },
  { id: "text", ruleIds: ["text.english_punct", "text.spaces", "text.irregular", "text.linebreak", "struct.empty_paragraph", "struct.heading_number", "struct.toc", "para.page_break_before", "para.snap_to_grid"] },
];



/* ================= UI localization (preserve ruleId; translate display text only) ================= */

const STR_FIX_GROUPS: Record<string, { title: LocaleText; description: LocaleText }> = {
  identity: {
    title: L('Limpieza de identidad', 'Identity cleanup'),
    description: L('Elimina la identidad legible por evaluadores.', 'Removes identity readable by evaluators.'),
  },
  format: {
    title: L('Diseño y formato', 'Layout & format'),
    description: L('Corrige según el preajuste actual, solo el punto afectado; portada e índice intactos.', 'Fixes per current preset, only affected items; cover and TOC untouched.'),
  },
  text: {
    title: L('Texto y estructura', 'Text & structure'),
    description: L('Puntuación latina y espacios no son cláusulas típicas; sin marcar por defecto.', 'Latin punctuation and spaces are atypical clauses; unchecked by default.'),
  },
};

const STR_FIX_ITEMS: Record<string, { label: LocaleText; hint: LocaleText }> = {
  'struct.doc_props': { label: L('Propiedades del documento', 'Document properties'), hint: L('Borra autor, editor, organización; plantilla a Normal', 'Clears author, editor, company; template to Normal') },
  'struct.comment': { label: L('Comentarios', 'Comments'), hint: L('Elimina comentarios y marcas', 'Removes comments and marks') },
  'struct.revision': { label: L('Revisiones sin aceptar', 'Unaccepted revisions'), hint: L('Acepta revisiones; fusiones/celdas manuales en Word', 'Accepts revisions; merges/cells need manual Word accept') },
  'text.hidden': { label: L('Texto oculto', 'Hidden text'), hint: L('Elimina el texto oculto, no lo muestra', 'Deletes hidden text instead of unhiding') },
  'struct.hyperlink': { label: L('Hipervínculos externos', 'External hyperlinks'), hint: L('Quita el enlace, conserva el texto', 'Unlinks, keeps text, drops URL') },
  'struct.field': { label: L('Campos de identidad', 'Identity fields'), hint: L('Elimina campos de autor/archivo/empresa', 'Removes author/file/company fields') },
  'struct.header_footer': { label: L('Encabezado y pie', 'Header & footer'), hint: L('Vacía según preajuste; conserva nº si se permite', 'Clears per preset; keeps page nº if allowed') },
  'image.meta': { label: L('Metadatos de imagen', 'Image metadata'), hint: L('Quita autor/copyright/ubicación; imagen intacta', 'Strips author/copyright/location; image intact') },
  'struct.bookmark': { label: L('Marcadores con identidad', 'Bookmarks with identity'), hint: L('Elimina marcadores con identidad (requiere revisión)', 'Removes identity bookmarks (requires check enabled)') },
  'page.paper_size': { label: L('Tamaño de papel', 'Paper size'), hint: L('Mantiene orientación', 'Keeps orientation') },
  'page.margins': { label: L('Márgenes', 'Margins'), hint: L('Cuatro lados según preajuste', 'Four sides per preset') },
  'page.columns': { label: L('Columnas', 'Columns'), hint: L('Pasa a una columna; sin marcar por defecto', 'Sets single column; unchecked by default') },
  'page.background': { label: L('Fondo de página', 'Page background'), hint: L('Quita color de fondo', 'Removes page color') },
  'para.line_spacing': { label: L('Interlineado', 'Line spacing'), hint: L('Según tipo y valor del preajuste', 'Per preset type and value') },
  'para.first_line_indent': { label: L('Sangría primera línea', 'First-line indent'), hint: L('Escribe caracteres y ancho real', 'Writes chars and actual width') },
  'para.space_before_after': { label: L('Espacio anterior/posterior', 'Space before/after'), hint: L('Según preajuste', 'Per preset') },
  'para.alignment': { label: L('Alineación', 'Alignment'), hint: L('Solo si el preajuste fija valor', 'Only if preset fixes a value') },
  'font.chinese': { label: L('Fuente china', 'CJK font'), hint: L('Quita también el tema que la cubre', 'Also removes covering theme font') },
  'font.western': { label: L('Fuente occidental', 'Latin font'), hint: L('Solo si el preajuste la fija', 'Only if preset fixes it') },
  'font.size': { label: L('Tamaño', 'Font size'), hint: L('Según texto o título', 'Per body or heading rules') },
  'font.bold': { label: L('Negrita', 'Bold'), hint: L('Títulos según regla; quita en texto/tablas si prohibido', 'Headings per rule; removes in body/tables if disallowed') },
  'font.italic': { label: L('Cursiva', 'Italic'), hint: L('Quita cursiva en texto y tablas', 'Removes italic in body and tables') },
  'font.underline': { label: L('Subrayado', 'Underline'), hint: L('Quita subrayado en texto y tablas', 'Removes underline in body and tables') },
  'font.color': { label: L('Color de texto', 'Text color'), hint: L('Pasa texto y tablas a negro', 'Sets body and table text to black') },
  'font.highlight': { label: L('Resaltado y sombreado', 'Highlight & shading'), hint: L('Quita resaltado y sombreado', 'Removes highlight and shading') },
  'font.effects': { label: L('Efectos anómalos', 'Abnormal font effects'), hint: L('Quita tachado, sombra, hueco', 'Removes strike, shadow, outline') },
  'font.char_spacing': { label: L('Espaciado', 'Character spacing'), hint: L('Restaura espaciado estándar', 'Restores standard spacing') },
  'font.scaling': { label: L('Escala de fuente', 'Font scaling'), hint: L('Restaura al 100 %', 'Restores to 100%') },
  'table.font': { label: L('Fuente de tablas', 'Table font'), hint: L('Según regla de tablas', 'Per table rules') },
  'table.size': { label: L('Tamaño en tablas', 'Table size'), hint: L('Según regla de tablas', 'Per table rules') },
  'table.indent': { label: L('Sangría en celdas', 'Cell indent'), hint: L('Según regla de tablas', 'Per table rules') },
  'table.shading': { label: L('Sombreado de celdas', 'Cell shading'), hint: L('Quita fondo de color', 'Removes colored shading') },
  'image.color': { label: L('Imágenes en color', 'Color images'), hint: L('Convierte PNG/JPEG a gris; tamaño y posición intactos', 'Converts PNG/JPEG to grayscale; size and position intact') },
  'text.english_punct': { label: L('Puntuación latina', 'Latin punctuation'), hint: L('Pasa a ancho completo; decimales/URLs intactos', 'Converts to full-width; decimals/URLs intact') },
  'text.spaces': { label: L('Espacios sobrantes', 'Extra spaces'), hint: L('Según reglas; conserva tras numeración', 'Per space rules; keeps after numbering') },
  'text.irregular': { label: L('Caracteres especiales', 'Special characters'), hint: L('Elimina cero-ancho; NBSP a espacio', 'Removes zero-width; NBSP to space') },
  'text.linebreak': { label: L('Saltos manuales', 'Manual breaks'), hint: L('Divide en dos; títulos/enlaces/campos intactos', 'Splits into two; headings/links/fields intact') },
  'struct.empty_paragraph': { label: L('Párrafos vacíos', 'Empty paragraphs'), hint: L('Borra vacíos sobrantes; conserva necesarios', 'Removes extras; keeps required ones') },
  'struct.heading_number': { label: L('Numeración de títulos', 'Heading numbering'), hint: L('Con arábigos exigidos: convierte, reordena 1/1.1/1.1.1 y sincroniza índice', 'With Arabic required: converts, reorders 1/1.1/1.1.1, syncs TOC') },
  'struct.toc': { label: L('Índice', 'TOC'), hint: L('Si "sin índice": elimina automático/texto/manual con título', 'If "no TOC": removes auto/text/manual-with-title TOC') },
  'para.page_break_before': { label: L('Salto antes del párrafo', 'Page break before'), hint: L('Quita salto anterior', 'Removes page break before') },
  'para.snap_to_grid': { label: L('Ajustar a cuadrícula', 'Snap to grid'), hint: L('Desactiva "ajustar a cuadrícula"', 'Turns off "snap to grid"') },
};

/** getFixGroups(lang): preserve fixGroups id/ruleId; translate only title/description/label/hint. */
export function getFixGroups(lang: AppLocale): FixGroup[] {
  return FIX_GROUP_RULES.map((group) => {
    const gt = STR_FIX_GROUPS[group.id];
    return {
      id: group.id,
      title: gt ? pickLang(lang, gt.title) : group.id,
      description: gt ? pickLang(lang, gt.description) : "",
      items: group.ruleIds.map((ruleId) => {
        const t = STR_FIX_ITEMS[ruleId];
        return { ruleId, label: t ? pickLang(lang, t.label) : ruleId, hint: t ? pickLang(lang, t.hint) : "" };
      }),
    };
  });
}

export const fixGroups: FixGroup[] = getFixGroups("es");

/** getFixRuleLabels(lang): ruleId -> translated label. */
export function getFixRuleLabels(lang: AppLocale): Record<string, string> {
  return Object.fromEntries(
    FIX_GROUP_RULES.flatMap((group) =>
      group.ruleIds.map((ruleId) => {
        const t = STR_FIX_ITEMS[ruleId];
        return [ruleId, t ? pickLang(lang, t.label) : ruleId];
      }),
    ),
  );
}

