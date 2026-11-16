import { fontDisplayName } from '../../../shared/i18n/fontDisplayName';
import { FONT_OPTIONS, SIZE_OPTIONS, SIZE_TO_PT } from '../../../shared/types/exportFormat';
import type { AppLocale } from '../../../shared/i18n';
import type { BlindCheckExtractedField, BlindCheckPresetSource, BlindCheckPresetTab, BlindCheckProfile } from './types';

/** Local display-text maps with zh fallback. Data file without hooks; localize using the lang parameter. */
type LocaleText = { es: string; en: string };
const pickLang = (lang: AppLocale, v: LocaleText): string => lang === "en" ? v.en : v.es;

export type PresetFieldKind = 'switch' | 'select' | 'number' | 'font' | 'size' | 'bold' | 'tristate' | 'words';

export interface PresetFieldOption {
  value: string;
  label: string;
}

export interface PresetField {
  path: string[];
  label: string;
  hint?: string;
  kind: PresetFieldKind;
  options?: PresetFieldOption[];
  unit?: string;
  min?: number;
  max?: number;
  /** Meaning of an empty select or number input, such as unchecked or same as body. */
  nullLabel?: string;
  /** Labels for true and false in a tristate switch; null uses nullLabel. */
  trueLabel?: string;
  falseLabel?: string;
  visible?: (profile: BlindCheckProfile) => boolean;
}

export interface PresetSection {
  title: string;
  description?: string;
  fields: PresetField[];
}

export const presetTabs: Array<{ id: BlindCheckPresetTab; label: string }> = [
  { id: 'page', label: 'Página' },
  { id: 'body', label: 'Texto' },
  { id: 'headings', label: 'Títulos e índice' },
  { id: 'table', label: 'Tablas e imágenes' },
  { id: 'privacy', label: 'Identidad y rastros' },
  { id: 'source', label: 'Notas de extracción' },
];

export const FONT_CHOICES: readonly string[] = FONT_OPTIONS;

export const SIZE_CHOICES = SIZE_OPTIONS.map((name) => ({ label: name, value: SIZE_TO_PT[name] }));

/** Display standard point sizes as Chinese size names; other sizes remain in points. */
export function sizeLabel(pt: number | null | undefined) {
  if (pt === null || pt === undefined) return 'No revisar';
  const match = SIZE_CHOICES.find((item) => Math.abs(item.value - pt) < 0.01);
  return match ? match.label : `${pt} pt`;
}

const lineRuleOptions: PresetFieldOption[] = [
  { value: 'exact', label: 'Exacto' },
  { value: 'atLeast', label: 'Mínimo' },
  { value: 'multiple', label: 'Múltiple' },
];

const alignmentOptions: PresetFieldOption[] = [
  { value: 'left', label: 'Izquierda' },
  { value: 'both', label: 'Justificado' },
  { value: 'center', label: 'Centrado' },
  { value: 'right', label: 'Derecha' },
];

const tocOptions: PresetFieldOption[] = [
  { value: 'hint', label: 'Solo avisar si manual' },
  { value: 'forbid', label: 'No permitido' },
  { value: 'require', label: 'Obligatorio' },
  { value: 'ignore', label: 'No revisar' },
];

const pageNumberOptions: PresetFieldOption[] = [
  { value: 'forbid', label: 'Sin numeración' },
  { value: 'footer_only', label: 'Solo pie de página' },
];

const headingNumberingOptions: PresetFieldOption[] = [
  { value: 'arabic', label: 'Arábiga (1, 1.1, 1.1.1)' },
];

const allowLabels = { trueLabel: 'Permitido', falseLabel: 'No permitido', nullLabel: 'No exigido' };
const headerFooterLabels = { trueLabel: 'Sin contenido', falseLabel: 'Contenido permitido', nullLabel: 'No exigido' };

const tableAlignmentOptions: PresetFieldOption[] = [
  { value: 'left', label: 'Izquierda' },
  { value: 'center', label: 'Centrado' },
  { value: 'right', label: 'Derecha' },
];

const paperOptions: PresetFieldOption[] = [
  { value: 'A4', label: 'A4' },
  { value: 'A3', label: 'A3' },
  { value: 'Letter', label: 'Letter' },
];

function headingFields(level: '1' | '2' | '3' | '4'): PresetField[] {
  return [
    { path: ['headings', level, 'font_cn'], label: 'headings.level.font_cn', kind: 'font', nullLabel: 'Igual que el texto' },
    { path: ['headings', level, 'size_pt'], label: 'headings.level.size_pt', kind: 'size', nullLabel: 'No revisar' },
    { path: ['headings', level, 'bold'], label: 'headings.level.bold', kind: 'bold' },
  ];
}

export const presetSections: Record<BlindCheckPresetTab, PresetSection[]> = {
  page: [
    {
      title: 'Papel y márgenes',
      fields: [
        { path: ['page', 'paper'], label: 'Tamaño de papel', kind: 'select', options: paperOptions, nullLabel: 'No exigido' },
        { path: ['page', 'margin_top_cm'], label: 'Margen superior', kind: 'number', unit: 'cm', min: 0, max: 10, nullLabel: 'No revisar' },
        { path: ['page', 'margin_bottom_cm'], label: 'Margen inferior', kind: 'number', unit: 'cm', min: 0, max: 10, nullLabel: 'No revisar' },
        { path: ['page', 'margin_left_cm'], label: 'Margen izquierdo', kind: 'number', unit: 'cm', min: 0, max: 10, nullLabel: 'No revisar' },
        { path: ['page', 'margin_right_cm'], label: 'Margen derecho', kind: 'number', unit: 'cm', min: 0, max: 10, nullLabel: 'No revisar' },
      ],
    },
    {
      title: 'Diseño de página',
      fields: [
        { path: ['page', 'check_orientation'], label: 'Revisar páginas horizontales', hint: 'El texto suele exigirse vertical', kind: 'switch' },
        { path: ['page', 'forbid_columns'], label: 'Revisar columnas', hint: 'Generalmente una sola columna', kind: 'switch' },
        { path: ['page', 'check_sections'], label: 'Uniformidad entre secciones', hint: 'Avisa si una sección difiere de la 1.ª', kind: 'switch' },
        { path: ['structure', 'skip_cover'], label: 'Detectar portada', hint: 'La portada no se revisa como texto; la identidad sí', kind: 'switch' },
      ],
    },
    {
      title: 'Encabezado, pie y numeración',
      fields: [
        { path: ['structure', 'check_header_footer'], label: 'Revisar encabezado/pie', kind: 'switch' },
        { path: ['structure', 'forbid_header_content'], label: 'Contenido del encabezado', kind: 'tristate', ...headerFooterLabels, visible: (profile) => profile.structure.check_header_footer },
        { path: ['structure', 'forbid_footer_content'], label: 'Contenido del pie', kind: 'tristate', ...headerFooterLabels, visible: (profile) => profile.structure.check_header_footer && profile.structure.page_number !== 'footer_only' },
        { path: ['structure', 'page_number'], label: 'Números de página', hint: 'Incluye "página X"; con solo-nº-en-pie, otro contenido del pie se marca', kind: 'select', options: pageNumberOptions, nullLabel: 'Sin límite' },
      ],
    },
  ],
  body: [
    {
      title: 'Fuente y tamaño',
      fields: [
        { path: ['body', 'font_cn'], label: 'Fuente china', kind: 'font', nullLabel: 'No revisar' },
        { path: ['body', 'font_en'], label: 'Fuente occidental', hint: 'Si el pliego no lo exige, no revisar', kind: 'font', nullLabel: 'No revisar' },
        { path: ['body', 'size_pt'], label: 'Tamaño', kind: 'size', nullLabel: 'No revisar' },
        { path: ['body', 'check_latin_size'], label: 'Revisar dígitos/latino por tamaño', hint: 'Desactivar si el pliego excluye dígitos/latino', kind: 'switch' },
      ],
    },
    {
      title: 'Párrafo',
      fields: [
        { path: ['body', 'line_rule'], label: 'Tipo de interlineado', kind: 'select', options: lineRuleOptions },
        { path: ['body', 'line_pt'], label: 'Valor de interlineado', kind: 'number', unit: 'pt', min: 1, max: 200, nullLabel: 'No revisar', visible: (profile) => profile.body.line_rule !== 'multiple' },
        { path: ['body', 'line_multiple'], label: 'Multiplicador', kind: 'number', unit: 'líneas', min: 0.5, max: 5, nullLabel: 'No revisar', visible: (profile) => profile.body.line_rule === 'multiple' },
        { path: ['body', 'first_line_indent_chars'], label: 'Sangría primera línea', kind: 'number', unit: 'caracteres', min: 0, max: 10, nullLabel: 'No revisar' },
        { path: ['body', 'space_before_pt'], label: 'Espacio anterior', kind: 'number', unit: 'pt', min: 0, max: 200, nullLabel: 'No revisar' },
        { path: ['body', 'space_after_pt'], label: 'Espacio posterior', kind: 'number', unit: 'pt', min: 0, max: 200, nullLabel: 'No revisar' },
        { path: ['body', 'alignment'], label: 'Alineación', hint: 'Configurar solo si el pliego lo exige', kind: 'select', options: alignmentOptions, nullLabel: 'No revisar' },
      ],
    },
    {
      title: 'Efectos de texto',
      description: 'Las opciones en "No permitido" se reportan si aparecen; "No exigido" no se revisa.',
      fields: [
        { path: ['body', 'allow_bold'], label: 'Negrita', kind: 'tristate', ...allowLabels },
        { path: ['body', 'allow_italic'], label: 'Cursiva', kind: 'tristate', ...allowLabels },
        { path: ['body', 'allow_underline'], label: 'Subrayado', kind: 'tristate', ...allowLabels },
        { path: ['body', 'allow_color'], label: 'Texto en color', hint: 'Con "no permitir" también revisa sombreado y fondo', kind: 'tristate', ...allowLabels },
        { path: ['body', 'allow_highlight'], label: 'Resaltado y sombreado', kind: 'tristate', ...allowLabels },
        { path: ['body', 'allow_char_spacing'], label: 'Permitir espaciado', kind: 'switch' },
        { path: ['body', 'allow_font_scaling'], label: 'Permitir escala', kind: 'switch' },
      ],
    },
    {
      title: 'Puntuación y espacios',
      fields: [
        { path: ['text', 'check_english_punct'], label: 'Puntuación latina en chino', kind: 'switch' },
        { path: ['text', 'check_spaces'], label: 'Espacios sobrantes', kind: 'switch' },
        { path: ['text', 'space_rules', 'strip_leading_trailing'], label: 'Espacios al inicio/fin', kind: 'switch', visible: (profile) => profile.text.check_spaces },
        { path: ['text', 'space_rules', 'remove_between_cjk'], label: 'Espacios entre chino', kind: 'switch', visible: (profile) => profile.text.check_spaces },
        { path: ['text', 'space_rules', 'forbid_fullwidth_space'], label: 'Espacio ancho', kind: 'switch', visible: (profile) => profile.text.check_spaces },
        { path: ['text', 'check_manual_linebreak'], label: 'Salto manual', kind: 'switch' },
        { path: ['text', 'check_tabs'], label: 'Tabuladores', kind: 'switch' },
        { path: ['text', 'check_irregular'], label: 'Caracteres invisibles', kind: 'switch' },
        { path: ['text', 'check_halfwidth_brackets'], label: 'Paréntesis latinos en chino', kind: 'switch' },
        { path: ['text', 'check_fullwidth_digits'], label: 'Dígitos anchos', kind: 'switch' },
        { path: ['text', 'check_fullwidth_letters'], label: 'Letras anchas', kind: 'switch' },
      ],
    },
    {
      title: 'Párrafos vacíos y cuadros de texto',
      fields: [
        { path: ['structure', 'check_empty_paragraphs'], label: 'Párrafos vacíos', kind: 'tristate', trueLabel: 'No permitido', falseLabel: 'Permitido', nullLabel: 'No exigido' },
        { path: ['structure', 'check_textbox'], label: 'Cuadros de texto', kind: 'switch' },
      ],
    },
    {
      title: 'Consistencia del cuerpo',
      description: 'Los campos en "No revisar" se comparan con la mayoría del documento.',
      fields: [
        { path: ['consistency', 'check_body_format'], label: 'Uniformidad del texto', kind: 'switch' },
        { path: ['consistency', 'check_mixed_fonts'], label: 'Mezcla de fuentes', hint: 'Si fuente china es "no revisar", marca 2+ fuentes en un párrafo', kind: 'switch' },
      ],
    },
    {
      title: 'Comprobaciones detalladas',
      description: 'Desactivado por defecto; actívalo si el pliego lo exige.',
      fields: [
        { path: ['body', 'check_snap_to_grid'], label: 'Ajustar a cuadrícula', hint: 'Con cuadrícula y sin valor fijo, el interlineado crece', kind: 'switch' },
        { path: ['body', 'check_vert_align'], label: 'Super/subíndices', hint: 'm³ es común; activar solo si se exige', kind: 'switch' },
      ],
    },
  ],
  headings: [
    ...(['1', '2', '3', '4'] as const).map((level) => ({
      title: `Título nivel ${level}`,
      description: level === '1' ? 'Se identifican primero por el índice; si la fuente es "Igual que el texto", se usa la del cuerpo.' : undefined,
      fields: headingFields(level),
    })),
    {
      title: 'Numeración de títulos',
      fields: [
        { path: ['structure', 'heading_numbering'], label: 'Formato de numeración', hint: 'Ej.: nivel 1 = 1,2,3; nivel 2 = 1.1,1.2', kind: 'select', options: headingNumberingOptions, nullLabel: 'No exigido' },
      ],
    },
    {
      title: 'Consistencia de títulos',
      description: 'Los campos en "No revisar" se comparan con la mayoría del mismo nivel.',
      fields: [
        { path: ['consistency', 'check_heading_format'], label: 'Uniformidad de títulos', kind: 'switch' },
        { path: ['consistency', 'check_heading_numbering'], label: 'Numeración continua', hint: 'Solo saltos/duplicados manuales', kind: 'switch' },
        { path: ['consistency', 'check_heading_level_jump'], label: 'Salto de nivel', hint: 'Ej.: nivel 1 seguido de nivel 3', kind: 'switch' },
        { path: ['consistency', 'check_heading_content'], label: 'Contenido anómalo', hint: 'Solo número o demasiado largo', kind: 'switch' },
        { path: ['consistency', 'heading_max_chars'], label: 'Límite de caracteres', kind: 'number', unit: 'caracteres', min: 10, max: 500, nullLabel: '60', visible: (profile) => profile.consistency.check_heading_content },
      ],
    },
    {
      title: 'Índice',
      fields: [
        { path: ['structure', 'check_toc_present'], label: 'Requisito de índice', kind: 'select', options: tocOptions },
      ],
    },
  ],
  table: [
    {
      title: 'Texto de tablas',
      fields: [
        { path: ['table', 'check_font'], label: 'Revisar fuente de tablas', kind: 'switch' },
        { path: ['table', 'font_cn'], label: 'Fuente china', kind: 'font', nullLabel: 'No revisar', visible: (profile) => profile.table.check_font },
        { path: ['table', 'check_size'], label: 'Revisar tamaño en tablas', kind: 'switch' },
        { path: ['table', 'size_pt'], label: 'Tamaño', kind: 'size', nullLabel: 'No revisar', visible: (profile) => profile.table.check_size },
        { path: ['table', 'check_first_line_indent'], label: 'Revisar sangría en celdas', kind: 'switch' },
        { path: ['table', 'first_line_indent_chars'], label: 'Sangría primera línea', kind: 'number', unit: 'caracteres', min: 0, max: 10, nullLabel: 'No revisar', visible: (profile) => profile.table.check_first_line_indent },
        { path: ['table', 'allow_bold'], label: 'Negrita en tablas', hint: 'Otros efectos siguen el texto', kind: 'tristate', trueLabel: 'Permitido', falseLabel: 'No permitido', nullLabel: 'Igual que el texto' },
      ],
    },
    {
      title: 'Estilo de tablas',
      fields: [
        { path: ['table', 'check_tblStyle'], label: 'Revisar estilo de tabla', hint: 'Marca estilos con cabecera de color o bandas', kind: 'switch' },
        { path: ['table', 'check_shading'], label: 'Revisar sombreado', hint: 'Revisa fondo de color si el color está prohibido', kind: 'switch' },
        { path: ['table', 'check_nested'], label: 'Revisar tablas anidadas', kind: 'switch' },
        { path: ['table', 'alignment'], label: 'Alineación de tabla', hint: 'Posición horizontal; solo si el pliego lo exige', kind: 'select', options: tableAlignmentOptions, nullLabel: 'No revisar' },
        { path: ['table', 'check_merge'], label: 'Celdas combinadas', hint: 'Cuenta tablas con fusión para revisión', kind: 'switch' },
      ],
    },
    {
      title: 'Imágenes',
      fields: [
        { path: ['image', 'check_color'], label: 'Imágenes en color', hint: 'Solo PNG/JPEG; decodifica una por una, puede ser lento', kind: 'switch' },
      ],
    },
  ],
  privacy: [
    {
      title: 'Palabras sensibles personalizadas',
      fields: [
        { path: ['privacy', 'keywords'], label: 'Palabras sensibles', hint: 'Una por línea: nombre de empresa, abreviaturas, responsables.', kind: 'words' },
        { path: ['privacy', 'whitelist'], label: 'Lista blanca', hint: 'Una por línea. No se marca, ej. nombre del licitador.', kind: 'words' },
      ],
    },
    {
      title: 'Detección integrada',
      fields: [
        { path: ['privacy', 'enable_builtin'], label: 'Autoreferencia y campos', hint: '"Nuestra empresa" y campos como teléfono', kind: 'switch' },
        { path: ['privacy', 'check_company_suffix'], label: 'Nombres de empresa', hint: 'Solo sufijos completos como "Ltd."', kind: 'switch' },
        { path: ['privacy', 'check_phone'], label: 'Teléfonos', kind: 'switch' },
        { path: ['privacy', 'check_id_card'], label: 'Documento de identidad', kind: 'switch' },
        { path: ['privacy', 'check_credit_code'], label: 'Código de crédito', kind: 'switch' },
        { path: ['privacy', 'check_email'], label: 'Correos', kind: 'switch' },
        { path: ['privacy', 'check_url'], label: 'URLs', kind: 'switch' },
        { path: ['privacy', 'check_bank_account'], label: 'Posibles cuentas bancarias', kind: 'switch' },
        { path: ['privacy', 'check_placeholder'], label: 'Marcadores sin rellenar', kind: 'switch' },
        { path: ['privacy', 'check_toc'], label: 'Incluir texto del índice', kind: 'switch' },
      ],
    },
    {
      title: 'Rastros de edición',
      fields: [
        { path: ['structure', 'check_revisions'], label: 'Revisiones sin aceptar', kind: 'switch' },
        { path: ['structure', 'check_comments'], label: 'Comentarios', kind: 'switch' },
        { path: ['structure', 'check_hidden_text'], label: 'Texto oculto', kind: 'switch' },
      ],
    },
    {
      title: 'Información oculta',
      fields: [
        { path: ['structure', 'check_hyperlink'], label: 'Hipervínculos externos', kind: 'switch' },
        { path: ['structure', 'check_field_codes'], label: 'Campos que filtran identidad', hint: 'Campos de autor, archivo, empresa', kind: 'switch' },
        { path: ['structure', 'check_bookmarks'], label: 'Marcadores', hint: 'Lista marcadores manuales; alto riesgo si contienen sensibles', kind: 'switch' },
        { path: ['image', 'check_vector'], label: 'Texto en vectoriales', hint: 'Extrae texto de EMF/WMF/SVG', kind: 'switch' },
        { path: ['image', 'check_metadata'], label: 'Metadatos de imagen', hint: 'Autor, copyright, ubicación', kind: 'switch' },
      ],
    },
    {
      title: 'Propiedades del documento',
      fields: [
        { path: ['props', 'check_author'], label: 'Autor', kind: 'switch' },
        { path: ['props', 'check_last_modified_by'], label: 'Último editor', kind: 'switch' },
        { path: ['props', 'check_company'], label: 'Organización', kind: 'switch' },
        { path: ['props', 'check_template'], label: 'Plantilla', kind: 'switch' },
        { path: ['props', 'check_custom_props'], label: 'Propiedades personalizadas', kind: 'switch' },
      ],
    },
  ],
  // The AI extraction notes tab has no editable fields; ExtractionNotice renders its contents.
  source: [],
};

const fieldLabels = new Map<string, string>();
const fieldDefinitions = new Map<string, PresetField>();
for (const tab of presetTabs) {
  for (const section of presetSections[tab.id]) {
    for (const field of section.fields) {
      fieldLabels.set(field.path.join('.'), `${tab.id === 'headings' ? section.title : tab.label} · ${field.label}`);
      fieldDefinitions.set(field.path.join('.'), field);
    }
  }
}

/** Field-path display name, such as Body / Chinese font or Heading 1 / Font size. */
export function presetFieldLabel(path: string) {
  return fieldLabels.get(path) || path;
}

/** Current field value as its UI option label, such as footer page numbers only, small-four size, or unchecked. */
export function presetFieldValueText(profile: BlindCheckProfile, path: string) {
  const field = fieldDefinitions.get(path);
  const value = readProfileValue(profile, path.split('.'));
  if (!field) return value === null || value === undefined ? 'No revisar' : String(value);
  if (value === null || value === undefined) return field.nullLabel || 'No revisar';
  switch (field.kind) {
    case 'switch':
      return value ? 'Activado' : 'Desactivado';
    case 'tristate':
      return value ? field.trueLabel || 'Sí' : field.falseLabel || 'No';
    case 'bold':
      return value ? 'Negrita' : 'Sin negrita';
    case 'size':
      return sizeLabel(value as number);
    case 'number':
      return `${value}${field.unit || ''}`;
    case 'select':
      return field.options?.find((option) => option.value === value)?.label || String(value);
    default:
      return String(value);
  }
}

export function readProfileValue(profile: BlindCheckProfile, path: string[]): unknown {
  let current: unknown = profile;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Set a field by path immutably and return a new preset profile. */
export function writeProfileValue(profile: BlindCheckProfile, path: string[], value: unknown): BlindCheckProfile {
  const write = (target: Record<string, unknown>, index: number): Record<string, unknown> => {
    const key = path[index];
    if (index === path.length - 1) return { ...target, [key]: value };
    return { ...target, [key]: write((target[key] as Record<string, unknown>) || {}, index + 1) };
  };
  return write(profile as unknown as Record<string, unknown>, 0) as unknown as BlindCheckProfile;
}

/**
 * AI source hints below a field: evidence means an unchanged extracted value; related means the source
 * contains a requirement (suspected omission or manual-review clause) but the field is unset. unspecified
 * means the tender did not require it and the check is disabled.
 */
export type FieldSourceNote =
  | { kind: 'evidence'; extracted: BlindCheckExtractedField }
  | { kind: 'related'; sentence: string }
  | { kind: 'unspecified' };

export function fieldSourceNote(profile: BlindCheckProfile, source: BlindCheckPresetSource, path: string[]): FieldSourceNote | null {
  const key = path.join('.');
  const value = readProfileValue(profile, path);
  const extracted = source.fields[key];
  if (extracted && extracted.value === value) return { kind: 'evidence', extracted };
  if (value !== null && value !== undefined) return null;
  const omission = source.omissions?.find((item) => item.fields.includes(key));
  const manualIndex = source.manualFields?.findIndex((paths) => paths.includes(key)) ?? -1;
  const sentence = omission?.sentence || (manualIndex >= 0 ? source.manual[manualIndex] : '');
  if (sentence) return { kind: 'related', sentence };
  if (source.unspecified.includes(key)) return { kind: 'unspecified' };
  return null;
}

/** Pending fields per tab, matching field warnings: unverified extracted values and unset fields with relevant source requirements. */
export function presetTabPending(tab: BlindCheckPresetTab, profile: BlindCheckProfile, source?: BlindCheckPresetSource) {
  if (!source) return 0;
  return presetSections[tab]
    .flatMap((section) => section.fields)
    .filter((field) => field.kind !== 'words' && (!field.visible || field.visible(profile)))
    .filter((field) => {
      const note = fieldSourceNote(profile, source, field.path);
      return note?.kind === 'related' || (note?.kind === 'evidence' && !note.extracted.verified);
    }).length;
}

/** Second-line tab summary uses only saved presets. Pending AI extraction items come first so they remain visible when text is truncated. */
export function presetTabSummary(tab: BlindCheckPresetTab, profile: BlindCheckProfile, source?: BlindCheckPresetSource, lang: AppLocale = 'es') {
  const pending = presetTabPending(tab, profile, source);
  const summary = baseTabSummary(tab, profile, source, lang);
  if (lang === 'es') return pending ? `${pending} por revisar · ${summary}` : summary;
  if (lang === 'en') return pending ? `${pending} to review · ${summary}` : summary;
  return pending ? `${pending} por revisar · ${summary}` : summary;
}

function baseTabSummary(tab: BlindCheckPresetTab, profile: BlindCheckProfile, source?: BlindCheckPresetSource, lang: AppLocale = 'es') {
  if (tab === 'page') {
    const margins = [profile.page.margin_top_cm, profile.page.margin_bottom_cm, profile.page.margin_left_cm, profile.page.margin_right_cm]
      .map((value) => (value === null ? '-' : String(value)));
    if (lang === 'es') return `${profile.page.paper || 'Papel cualquiera'} · Márgenes ${margins.join('/')}`;
    if (lang === 'en') return `${profile.page.paper || 'Any paper'} · Margins ${margins.join('/')}`;
    return `${profile.page.paper || 'Papel sin límite'} · Márgenes ${margins.join('/')}`;
  }
  if (tab === 'body') {
    const line = profile.body.line_rule === 'multiple'
      ? `${profile.body.line_multiple ?? '-'} ${lang === 'es' ? 'líneas' : 'lines'}`
      : `${profile.body.line_rule === 'exact' ? (lang === 'es' ? 'Fijo' : 'Fixed') : (lang === 'es' ? 'Mínimo' : 'At least')} ${profile.body.line_pt ?? '-'} ${'pt'}`;
    if (lang === 'es') return `${fontDisplayName(profile.body.font_cn || '') || 'Fuente cualquiera'} ${localizedSizeLabel(lang, profile.body.size_pt)} · ${line}`;
    if (lang === 'en') return `${fontDisplayName(profile.body.font_cn || '') || 'Any font'} ${localizedSizeLabel(lang, profile.body.size_pt)} · ${line}`;
    return `${profile.body.font_cn || 'Sin límite'} ${sizeLabel(profile.body.size_pt)} · ${line}`;
  }
  if (tab === 'headings') {
    const first = profile.headings['1'];
    const toc = profile.structure.check_toc_present === 'require'
      ? (lang === 'es' ? ' · Requiere índice' : ' · TOC required')
      : profile.structure.check_toc_present === 'forbid'
        ? (lang === 'es' ? ' · Sin índice' : ' · No TOC')
        : '';
    if (lang === 'es') return `Nivel 1 ${localizedSizeLabel(lang, first.size_pt)}${first.bold === true ? ' · Negrita' : ''}${toc}`;
    if (lang === 'en') return `Level 1 ${localizedSizeLabel(lang, first.size_pt)}${first.bold === true ? ' · Bold' : ''}${toc}`;
    return `Nivel 1 ${sizeLabel(first.size_pt)}${first.bold === true ? ' negrita' : ''}${toc}`;
  }
  if (tab === 'table') {
    if (lang === 'es') return `${profile.table.check_font ? fontDisplayName(profile.table.font_cn || '') || 'Fuente cualquiera' : 'Sin revisar fuente'} ${profile.table.check_size ? localizedSizeLabel(lang, profile.table.size_pt) : 'Sin revisar tamaño'}`;
    if (lang === 'en') return `${profile.table.check_font ? fontDisplayName(profile.table.font_cn || '') || 'Any font' : 'Font unchecked'} ${profile.table.check_size ? localizedSizeLabel(lang, profile.table.size_pt) : 'Size unchecked'}`;
    return `${profile.table.check_font ? profile.table.font_cn || 'Sin límite' : 'Sin fuente'} ${profile.table.check_size ? sizeLabel(profile.table.size_pt) : 'Sin tamaño'}`;
  }
  if (tab === 'source') {
    if (lang === 'es') return source?.manual.length ? `Revisión manual: ${source.manual.length}` : 'Sin revisión manual';
    if (lang === 'en') return source?.manual.length ? `Manual review: ${source.manual.length}` : 'No manual review';
    return source?.manual.length ? `Revisión manual (${source.manual.length})` : 'Sin revisión manual';
  }
  if (lang === 'es') return `Sensibles ${profile.privacy.keywords.length} · Lista blanca ${profile.privacy.whitelist.length}`;
  if (lang === 'en') return `Sensitive ${profile.privacy.keywords.length} · Allowlist ${profile.privacy.whitelist.length}`;
  return `Sensibles ${profile.privacy.keywords.length} · Lista blanca ${profile.privacy.whitelist.length}`;
}

/* ================= UI localization (preserve IDs/paths; translate display text only) ================= */

const L = (es: string, en: string): LocaleText => ({ es, en });

/** Tab names. */
export const STR_PRESET_TABS: Record<BlindCheckPresetTab, LocaleText> = {
  page: L('Página', 'Page'),
  body: L('Texto', 'Body'),
  headings: L('Títulos e índice', 'Headings & TOC'),
  table: L('Tablas e imágenes', 'Tables & images'),
  privacy: L('Identidad y rastros', 'Identity & traces'),
  source: L('Nota de extracción IA', 'AI extraction note'),
};

/** localizedPresetTabs(lang): preserve presetTabs order and IDs; translate labels only. */
export function localizedPresetTabs(lang: AppLocale): Array<{ id: BlindCheckPresetTab; label: string }> {
  return presetTabs.map((tab) => ({ id: tab.id, label: pickLang(lang, STR_PRESET_TABS[tab.id]) }));
}

/** Common option, tristate, and unit labels. Technical rule names retain Chinese parenthetical terms (for example, page breaks). */
const STR_MISC: Record<string, LocaleText> = {
  noCheck: L('No revisar', 'Do not check'),
  noRequired: L('No exigido en pliego', 'Not required by tender'),
  sameBody: L('Igual que texto', 'Same as body'),
  unlimited: L('Sin límite', 'No limit'),
  paperAny: L('Papel cualquiera', 'Any paper'),
  fontAny: L('Fuente cualquiera', 'Any font'),
  enable: L('Activado', 'On'),
  disable: L('Desactivado', 'Off'),
  yes: L('Sí', 'Yes'),
  no: L('No', 'No'),
  bold: L('Negrita', 'Bold'),
  notBold: L('Sin negrita', 'Not bold'),
  pt: L('pt', 'pt'),
  lineExact: L('Valor fijo', 'Exact value'),
  lineAtLeast: L('Valor mínimo', 'At least'),
  lineMultiple: L('Interlineado múltiple', 'Multiple spacing'),
  alignLeft: L('Izquierda', 'Left'),
  alignBoth: L('Justificado', 'Justified'),
  alignCenter: L('Centrado', 'Center'),
  alignRight: L('Derecha', 'Right'),
  tocHint: L('Solo avisar índice manual', 'Only flag manual TOC'),
  tocForbid: L('Índice no permitido', 'TOC not allowed'),
  tocRequire: L('Índice obligatorio', 'TOC required'),
  tocIgnore: L('No revisar', 'Do not check'),
  pageForbid: L('Sin números de página', 'No page numbers'),
  pageFooterOnly: L('Solo nº página en pie', 'Only page nº in footer'),
  numberingArabic: L('Numeración arábiga (1, 1.1, 1.1.1)', 'Arabic numbering (1, 1.1, 1.1.1)'),
  allow: L('Permitir', 'Allow'),
  forbid: L('No permitir', 'Disallow'),
  headerForbidTrue: L('Sin contenido', 'Must be empty'),
  headerForbidFalse: L('Contenido permitido', 'Content allowed'),
  emptyParaTrue: L('No permitir', 'Disallow'),
  emptyParaFalse: L('Permitir', 'Allow'),
  tableBoldSame: L('Igual que texto', 'Same as body'),
};

/** Field display keys grouped by path: label / hint / nullLabel / trueLabel / falseLabel / unit. */
const STR_FIELDS: Record<string, { label: LocaleText; hint?: LocaleText; nullLabel?: LocaleText; trueLabel?: LocaleText; falseLabel?: LocaleText; unit?: LocaleText }> = {
  'headings.font_cn': { label: L('Fuente china', 'CJK font') },
  'headings.size_pt': { label: L('Tamaño', 'Font size') },
  'headings.bold': { label: L('Negrita', 'Bold') },
  'page.paper': { label: L('Tamaño de papel', 'Paper size'), nullLabel: L('No exigido en pliego', 'Not required by tender') },
  'page.margin_top_cm': { label: L('Margen superior', 'Top margin'), unit: L('cm', 'cm'), nullLabel: L('No revisar', 'Do not check') },
  'page.margin_bottom_cm': { label: L('Margen inferior', 'Bottom margin'), unit: L('cm', 'cm'), nullLabel: L('No revisar', 'Do not check') },
  'page.margin_left_cm': { label: L('Margen izquierdo', 'Left margin'), unit: L('cm', 'cm'), nullLabel: L('No revisar', 'Do not check') },
  'page.margin_right_cm': { label: L('Margen derecho', 'Right margin'), unit: L('cm', 'cm'), nullLabel: L('No revisar', 'Do not check') },
  'page.check_orientation': { label: L('Revisar páginas horizontales', 'Check landscape pages'), hint: L('El texto suele exigirse vertical', 'Body text is usually portrait') },
  'page.forbid_columns': { label: L('Revisar columnas', 'Check columns'), hint: L('Generalmente una sola columna', 'Usually single column') },
  'page.check_sections': { label: L('Uniformidad entre secciones', 'Consistent section setup'), hint: L('Avisa si una sección difiere de la 1.ª', 'Warn if a section differs from section 1') },
  'structure.skip_cover': { label: L('Detectar portada', 'Detect cover'), hint: L('La portada no se revisa como texto; la identidad sí', 'Cover skipped for body format; identity still checked') },
  'structure.check_header_footer': { label: L('Revisar encabezado/pie', 'Check header/footer') },
  'structure.forbid_header_content': { label: L('Contenido del encabezado', 'Header content'), nullLabel: L('No exigido en pliego', 'Not required by tender'), trueLabel: L('Sin contenido', 'Must be empty'), falseLabel: L('Contenido permitido', 'Content allowed') },
  'structure.forbid_footer_content': { label: L('Contenido del pie', 'Footer content'), nullLabel: L('No exigido en pliego', 'Not required by tender'), trueLabel: L('Sin contenido', 'Must be empty'), falseLabel: L('Contenido permitido', 'Content allowed') },
  'structure.page_number': { label: L('Números de página', 'Page numbers'), hint: L('Incluye "página X"; con solo-nº-en-pie, otro contenido del pie se marca', 'Includes "page X"; with footer-only mode, other footer content is flagged'), nullLabel: L('Sin límite', 'No limit') },
  'body.font_cn': { label: L('Fuente china', 'CJK font'), nullLabel: L('No revisar', 'Do not check') },
  'body.font_en': { label: L('Fuente occidental', 'Latin font'), hint: L('Si el pliego no lo exige, no revisar', 'Keep unchecked if tender is silent'), nullLabel: L('No revisar', 'Do not check') },
  'body.size_pt': { label: L('Tamaño', 'Font size'), nullLabel: L('No revisar', 'Do not check') },
  'body.check_latin_size': { label: L('Revisar dígitos/latino por tamaño', 'Check digits/Latin by size'), hint: L('Desactivar si el pliego excluye dígitos/latino', 'Turn off if tender excludes digits/Latin') },
  'body.line_rule': { label: L('Tipo de interlineado', 'Line spacing type') },
  'body.line_pt': { label: L('Valor de interlineado', 'Line spacing value'), unit: L('pt', 'pt'), nullLabel: L('No revisar', 'Do not check') },
  'body.line_multiple': { label: L('Multiplicador', 'Line multiple'), unit: L('líneas', 'lines'), nullLabel: L('No revisar', 'Do not check') },
  'body.first_line_indent_chars': { label: L('Sangría primera línea', 'First-line indent'), unit: L('caracteres', 'chars'), nullLabel: L('No revisar', 'Do not check') },
  'body.space_before_pt': { label: L('Espacio anterior', 'Space before'), unit: L('pt', 'pt'), nullLabel: L('No revisar', 'Do not check') },
  'body.space_after_pt': { label: L('Espacio posterior', 'Space after'), unit: L('pt', 'pt'), nullLabel: L('No revisar', 'Do not check') },
  'body.alignment': { label: L('Alineación', 'Alignment'), hint: L('Configurar solo si el pliego lo exige', 'Set only if tender requires'), nullLabel: L('No revisar', 'Do not check') },
  'body.allow_bold': { label: L('Negrita', 'Bold'), nullLabel: L('No exigido en pliego', 'Not required by tender'), trueLabel: L('Permitir', 'Allow'), falseLabel: L('No permitir', 'Disallow') },
  'body.allow_italic': { label: L('Cursiva', 'Italic'), nullLabel: L('No exigido en pliego', 'Not required by tender'), trueLabel: L('Permitir', 'Allow'), falseLabel: L('No permitir', 'Disallow') },
  'body.allow_underline': { label: L('Subrayado', 'Underline'), nullLabel: L('No exigido en pliego', 'Not required by tender'), trueLabel: L('Permitir', 'Allow'), falseLabel: L('No permitir', 'Disallow') },
  'body.allow_color': { label: L('Texto en color', 'Colored text'), hint: L('Con "no permitir" también revisa sombreado y fondo', 'With disallow, also checks shading and background'), nullLabel: L('No exigido en pliego', 'Not required by tender'), trueLabel: L('Permitir', 'Allow'), falseLabel: L('No permitir', 'Disallow') },
  'body.allow_highlight': { label: L('Resaltado y sombreado', 'Highlight & shading'), nullLabel: L('No exigido en pliego', 'Not required by tender'), trueLabel: L('Permitir', 'Allow'), falseLabel: L('No permitir', 'Disallow') },
  'body.allow_char_spacing': { label: L('Permitir espaciado', 'Allow char spacing') },
  'body.allow_font_scaling': { label: L('Permitir escala', 'Allow font scaling') },
  'text.check_english_punct': { label: L('Puntuación latina en chino', 'Latin punctuation in CJK') },
  'text.check_spaces': { label: L('Espacios sobrantes', 'Extra spaces') },
  'text.space_rules.strip_leading_trailing': { label: L('Espacios al inicio/fin', 'Leading/trailing spaces') },
  'text.space_rules.remove_between_cjk': { label: L('Espacios entre chino', 'Spaces between CJK') },
  'text.space_rules.forbid_fullwidth_space': { label: L('Espacio ancho', 'Full-width space') },
  'text.check_manual_linebreak': { label: L('Salto manual', 'Manual break') },
  'text.check_tabs': { label: L('Tabuladores', 'Tabs') },
  'text.check_irregular': { label: L('Caracteres invisibles', 'Invisible chars') },
  'text.check_halfwidth_brackets': { label: L('Paréntesis latinos en chino', 'Half-width brackets in CJK') },
  'text.check_fullwidth_digits': { label: L('Dígitos anchos', 'Full-width digits') },
  'text.check_fullwidth_letters': { label: L('Letras anchas', 'Full-width letters') },
  'structure.check_empty_paragraphs': { label: L('Párrafos vacíos', 'Empty paragraphs'), nullLabel: L('No exigido en pliego', 'Not required by tender'), trueLabel: L('No permitir', 'Disallow'), falseLabel: L('Permitir', 'Allow') },
  'structure.check_textbox': { label: L('Cuadros de texto', 'Text boxes') },
  'consistency.check_body_format': { label: L('Uniformidad del texto', 'Body format consistency') },
  'consistency.check_mixed_fonts': { label: L('Mezcla de fuentes', 'Mixed fonts in paragraph'), hint: L('Si fuente china es "no revisar", marca 2+ fuentes en un párrafo', 'If CJK font unchecked, flags 2+ CJK fonts in one paragraph') },
  'body.check_snap_to_grid': { label: L('Ajustar a cuadrícula', 'Snap to grid'), hint: L('Con cuadrícula y sin valor fijo, el interlineado crece', 'With grid and non-fixed spacing, spacing grows') },
  'body.check_vert_align': { label: L('Super/subíndices', 'Superscript/subscript'), hint: L('m³ es común; activar solo si se exige', 'm³ is common; enable only if required') },
  'structure.heading_numbering': { label: L('Formato de numeración', 'Numbering format'), hint: L('Ej.: nivel 1 = 1,2,3; nivel 2 = 1.1,1.2', 'E.g. level 1 = 1,2,3; level 2 = 1.1,1.2'), nullLabel: L('No exigido en pliego', 'Not required by tender') },
  'consistency.check_heading_format': { label: L('Uniformidad de títulos', 'Heading format consistency') },
  'consistency.check_heading_numbering': { label: L('Numeración continua', 'Continuous numbering'), hint: L('Solo saltos/duplicados manuales', 'Only manual skips/duplicates') },
  'consistency.check_heading_level_jump': { label: L('Salto de nivel', 'Skipped heading level'), hint: L('Ej.: nivel 1 seguido de nivel 3', 'E.g. level 1 followed by level 3') },
  'consistency.check_heading_content': { label: L('Contenido anómalo', 'Abnormal heading content'), hint: L('Solo número o demasiado largo', 'Number only or too long') },
  'consistency.heading_max_chars': { label: L('Límite de caracteres', 'Heading char limit'), unit: L('caracteres', 'chars'), nullLabel: L('60', '60') },
  'structure.check_toc_present': { label: L('Requisito de índice', 'TOC requirement') },
  'table.check_font': { label: L('Revisar fuente de tablas', 'Check table font') },
  'table.font_cn': { label: L('Fuente china', 'CJK font'), nullLabel: L('No revisar', 'Do not check') },
  'table.check_size': { label: L('Revisar tamaño en tablas', 'Check table size') },
  'table.size_pt': { label: L('Tamaño', 'Font size'), nullLabel: L('No revisar', 'Do not check') },
  'table.check_first_line_indent': { label: L('Revisar sangría en celdas', 'Check cell indent') },
  'table.first_line_indent_chars': { label: L('Sangría primera línea', 'First-line indent'), unit: L('caracteres', 'chars'), nullLabel: L('No revisar', 'Do not check') },
  'table.allow_bold': { label: L('Negrita en tablas', 'Bold in tables'), hint: L('Otros efectos siguen el texto', 'Other effects follow body rules'), nullLabel: L('Igual que texto', 'Same as body'), trueLabel: L('Permitir', 'Allow'), falseLabel: L('No permitir', 'Disallow') },
  'table.check_tblStyle': { label: L('Revisar estilo de tabla', 'Check table style'), hint: L('Marca estilos con cabecera de color o bandas', 'Flags styles with colored header/banding') },
  'table.check_shading': { label: L('Revisar sombreado', 'Check cell shading'), hint: L('Revisa fondo de color si el color está prohibido', 'Checks shading when color is disallowed') },
  'table.check_nested': { label: L('Revisar tablas anidadas', 'Check nested tables') },
  'table.alignment': { label: L('Alineación de tabla', 'Table alignment'), hint: L('Posición horizontal; solo si el pliego lo exige', 'Horizontal position; set only if required'), nullLabel: L('No revisar', 'Do not check') },
  'table.check_merge': { label: L('Celdas combinadas', 'Merged cells'), hint: L('Cuenta tablas con fusión para revisión', 'Counts merged-cell tables for review') },
  'image.check_color': { label: L('Imágenes en color', 'Color images'), hint: L('Solo PNG/JPEG; decodifica una por una, puede ser lento', 'PNG/JPEG only; decodes one by one, may be slow') },
  'privacy.keywords': { label: L('Palabras sensibles', 'Sensitive words'), hint: L('Una por línea: nombre de empresa, abreviaturas, responsables.', 'One per line: company names, abbreviations, managers.') },
  'privacy.whitelist': { label: L('Lista blanca', 'Allowlist'), hint: L('Una por línea. No se marca, ej. nombre del licitador.', 'One per line. Not flagged, e.g. tender owner name.') },
  'privacy.enable_builtin': { label: L('Autoreferencia y campos', 'Self-reference & fields'), hint: L('"Nuestra empresa" y campos como teléfono', '"Our company" and fields like phone') },
  'privacy.check_company_suffix': { label: L('Nombres de empresa', 'Company names'), hint: L('Solo sufijos completos como "Ltd."', 'Only full suffixes like "Ltd."') },
  'privacy.check_phone': { label: L('Teléfonos', 'Phone numbers') },
  'privacy.check_id_card': { label: L('Documento de identidad', 'ID numbers') },
  'privacy.check_credit_code': { label: L('Código de crédito', 'Credit code') },
  'privacy.check_email': { label: L('Correos', 'Emails') },
  'privacy.check_url': { label: L('URLs', 'URLs') },
  'privacy.check_bank_account': { label: L('Posibles cuentas bancarias', 'Suspected bank accounts') },
  'privacy.check_placeholder': { label: L('Marcadores sin rellenar', 'Unfilled placeholders') },
  'privacy.check_toc': { label: L('Incluir texto del índice', 'Include TOC text') },
  'structure.check_revisions': { label: L('Revisiones sin aceptar', 'Unaccepted revisions') },
  'structure.check_comments': { label: L('Comentarios', 'Comments') },
  'structure.check_hidden_text': { label: L('Texto oculto', 'Hidden text') },
  'structure.check_hyperlink': { label: L('Hipervínculos externos', 'External hyperlinks') },
  'structure.check_field_codes': { label: L('Campos que filtran identidad', 'Identity-leaking fields'), hint: L('Campos de autor, archivo, empresa', 'Author, filename, company fields') },
  'structure.check_bookmarks': { label: L('Marcadores', 'Bookmarks'), hint: L('Lista marcadores manuales; alto riesgo si contienen sensibles', 'Lists manual bookmarks; high risk if sensitive') },
  'image.check_vector': { label: L('Texto en vectoriales', 'Text in vector images'), hint: L('Extrae texto de EMF/WMF/SVG', 'Extracts text from EMF/WMF/SVG') },
  'image.check_metadata': { label: L('Metadatos de imagen', 'Image metadata'), hint: L('Autor, copyright, ubicación', 'Author, copyright, location') },
  'props.check_author': { label: L('Autor', 'Author') },
  'props.check_last_modified_by': { label: L('Último editor', 'Last modified by') },
  'props.check_company': { label: L('Organización', 'Company') },
  'props.check_template': { label: L('Plantilla', 'Template name') },
  'props.check_custom_props': { label: L('Propiedades personalizadas', 'Custom properties') },
};

/** Heading-level names. */
const STR_HEADING_LEVEL: Record<string, LocaleText> = {
  '1': L('Título nivel 1', 'Heading level 1'),
  '2': L('Título nivel 2', 'Heading level 2'),
  '3': L('Título nivel 3', 'Heading level 3'),
  '4': L('Título nivel 4', 'Heading level 4'),
};

/** Section titles/descriptions addressed by tab and index, in presetSections order. */
const STR_SECTIONS: Record<string, { title: LocaleText; description?: LocaleText }> = {
  'headings:0': { title: L('Título nivel 1', 'Heading level 1'), description: L('Se identifican primero los títulos del índice; si eliges la misma fuente, se usa la del texto.', 'Headings are identified from the document index first; the body font is used when selected.') },
  'page:0': { title: L('Papel y márgenes', 'Paper & margins') },
  'page:1': { title: L('Diseño', 'Layout') },
  'page:2': { title: L('Encabezado, pie y nº', 'Header, footer & page nº') },
  'body:0': { title: L('Fuente y tamaño', 'Font & size') },
  'body:1': { title: L('Párrafos', 'Paragraphs') },
  'body:2': { title: L('Efectos de texto', 'Text effects'), description: L('Lo "no permitido" se marca en texto y tablas; lo "no exigido" no se revisa.', 'Disallowed effects are flagged in body and tables; unrequired ones are skipped.') },
  'body:3': { title: L('Puntuación y espacios', 'Punctuation & spaces') },
  'body:4': { title: L('Párrafos vacíos y cuadros', 'Empty paragraphs & boxes') },
  'body:5': { title: L('Uniformidad del texto', 'Body consistency'), description: L('Fuente/tamaño/alineación "no revisados" se comparan con la mayoría.', 'Unchecked font/size/alignment are compared against the majority.') },
  'body:6': { title: L('Revisiones finas', 'Fine-grained checks'), description: L('Desactivado por defecto; activar si el pliego lo exige.', 'Off by default; enable if tender requires.') },
  'headings:4': { title: L('Numeración de títulos', 'Heading numbering') },
  'headings:5': { title: L('Uniformidad de títulos', 'Heading consistency'), description: L('Lo no revisado, más alineación y sangría, se compara por nivel.', 'Unchecked items, plus alignment and indent, are compared per level.') },
  'headings:6': { title: L('Índice', 'TOC') },
  'table:0': { title: L('Texto de tablas', 'Table text') },
  'table:1': { title: L('Estilo de tablas', 'Table style') },
  'table:2': { title: L('Imágenes', 'Images') },
  'privacy:0': { title: L('Sensibles personalizadas', 'Custom sensitive words') },
  'privacy:1': { title: L('Detección integrada', 'Built-in detection') },
  'privacy:2': { title: L('Marcas de edición', 'Editing traces') },
  'privacy:3': { title: L('Información oculta', 'Hidden info') },
  'privacy:4': { title: L('Propiedades del documento', 'Document properties') },
};

const OPTION_STR: Record<string, LocaleText> = {
  exact: L('Valor fijo', 'Exact value'),
  atLeast: L('Valor mínimo', 'At least'),
  multiple: L('Interlineado múltiple', 'Multiple spacing'),
  left: L('Izquierda', 'Left'),
  both: L('Justificado', 'Justified'),
  center: L('Centrado', 'Center'),
  right: L('Derecha', 'Right'),
  hint: L('Solo avisar índice manual', 'Only flag manual TOC'),
  forbid: L('Índice no permitido', 'TOC not allowed'),
  require: L('Índice obligatorio', 'TOC required'),
  ignore: L('No revisar', 'Do not check'),
  footer_only: L('Solo nº en pie', 'Only nº in footer'),
  arabic: L('Numeración arábiga (1, 1.1, 1.1.1)', 'Arabic numbering (1, 1.1, 1.1.1)'),
};

function localizeOption(option: PresetFieldOption, lang: AppLocale): PresetFieldOption {
  const t = OPTION_STR[option.value];
  return t ? { ...option, label: pickLang(lang, t) } : option;
}

function localizeField(field: PresetField, lang: AppLocale): PresetField {
  if (false && lang === 'zh') return field;
  const key = field.path.join('.');
  const t = STR_FIELDS[key.replace(/^headings\.[1-4]\./, 'headings.')];
  const next: PresetField = { ...field };
  if (t?.label) next.label = pickLang(lang, t.label);
  if (t?.hint) next.hint = pickLang(lang, t.hint);
  if (t?.nullLabel) next.nullLabel = pickLang(lang, t.nullLabel);
  if (t?.trueLabel) (next as PresetField).trueLabel = pickLang(lang, t.trueLabel);
  if (t?.falseLabel) (next as PresetField).falseLabel = pickLang(lang, t.falseLabel);
  if (t?.unit) next.unit = pickLang(lang, t.unit);
  // Common fallback: null/true/false labels without field-specific entries use MISC translations.
  if (next.nullLabel === 'No revisar') next.nullLabel = pickLang(lang, STR_MISC.noCheck);
  if (next.nullLabel === 'No exigido') next.nullLabel = pickLang(lang, STR_MISC.noRequired);
  if (next.nullLabel === 'Igual que el texto') next.nullLabel = pickLang(lang, STR_MISC.sameBody);
  if (next.nullLabel === 'Sin límite') next.nullLabel = pickLang(lang, STR_MISC.unlimited);
  if ((next.trueLabel === 'Permitido' && !t?.trueLabel)) next.trueLabel = pickLang(lang, STR_MISC.allow);
  if ((next.falseLabel === 'No permitido' && !t?.falseLabel)) next.falseLabel = pickLang(lang, STR_MISC.forbid);
  if (next.options) next.options = next.options.map((o) => localizeOption(o, lang));
  return next;
}

/** localizedPresetSections(lang): preserve presetSections structure and paths; translate display text only. */
export function localizedPresetSections(lang: AppLocale): Record<BlindCheckPresetTab, PresetSection[]> {
  if (false && lang === 'zh') return presetSections;
  const out = {} as Record<BlindCheckPresetTab, PresetSection[]>;
  (Object.keys(presetSections) as BlindCheckPresetTab[]).forEach((tab) => {
    out[tab] = presetSections[tab].map((section, index) => {
      let title = section.title;
      // Heading levels one through four.
      const levelMatch = title.match(/^Título nivel ([1-4])$/);
      if (tab === 'headings' && levelMatch) {
        title = pickLang(lang, STR_HEADING_LEVEL[levelMatch[1]]);
      } else {
        const t = STR_SECTIONS[`${tab}:${index}`];
        if (t) title = pickLang(lang, t.title);
      }
      const descKey = STR_SECTIONS[`${tab}:${index}`]?.description;
      return {
        title,
        description: descKey ? pickLang(lang, descKey) : section.description,
        fields: section.fields.map((f) => localizeField(f, lang)),
      };
    });
  });
  return out;
}

/** localizedSizeLabel(lang, pt): point-size display; nonstandard sizes remain in points. */
export function localizedSizeLabel(lang: AppLocale, pt: number | null | undefined) {
  if (pt === null || pt === undefined) return pickLang(lang, STR_MISC.noCheck);
  return `${pt} ${pickLang(lang, STR_MISC.pt)}`;
}

/** localizedPresetFieldLabel(path, lang): field display name. */
export function localizedPresetFieldLabel(path: string, lang: AppLocale = 'es') {
  if (false && lang === 'zh') return presetFieldLabel(path);
  const t = STR_FIELDS[path.replace(/^headings\.[1-4]\./, 'headings.')];
  const tabOf = (p: string) => {
    for (const tab of presetTabs) {
      for (const section of presetSections[tab.id]) {
        if (section.fields.some((f) => f.path.join('.') === p)) return tab.id;
      }
    }
    return null;
  };
  const tab = tabOf(path);
  const tabLabel = tab ? pickLang(lang, STR_PRESET_TABS[tab]) : tab;
  const fieldLabel = t ? pickLang(lang, t.label) : presetFieldLabel(path);
  if (tab === 'headings') {
    // Use section titles (including levels) under headings.
    for (const section of presetSections.headings) {
      if (section.fields.some((f) => f.path.join('.') === path)) {
        const m = section.title.match(/^(?:Título nivel |Heading level )([1-4])$/);
        
        const secTitle = m ? pickLang(lang, STR_HEADING_LEVEL[m[1]]) : section.title;
        return `${secTitle} · ${t ? pickLang(lang, t.label) : path.split('.').pop()}`;
      }
    }
  }
  return tabLabel ? `${tabLabel} · ${t ? pickLang(lang, t.label) : fieldLabel}` : fieldLabel;
}

/** localizedPresetFieldValueText(profile, path, lang): display text for the current field value. */
export function localizedPresetFieldValueText(profile: BlindCheckProfile, path: string, lang: AppLocale = 'es') {
  if (false && lang === 'zh') return presetFieldValueText(profile, path);
  const field = (() => {
    for (const tab of presetTabs) {
      for (const section of presetSections[tab.id]) {
        const found = section.fields.find((f) => f.path.join('.') === path);
        if (found) return localizeField(found, lang);
      }
    }
    return undefined;
  })();
  const value = readProfileValue(profile, path.split('.'));
  if (!field) return value === null || value === undefined ? pickLang(lang, STR_MISC.noCheck) : String(value);
  if (value === null || value === undefined) return field.nullLabel || pickLang(lang, STR_MISC.noCheck);
  switch (field.kind) {
    case 'switch':
      return value ? pickLang(lang, STR_MISC.enable) : pickLang(lang, STR_MISC.disable);
    case 'tristate':
      return value ? field.trueLabel || pickLang(lang, STR_MISC.yes) : field.falseLabel || pickLang(lang, STR_MISC.no);
    case 'bold':
      return value ? pickLang(lang, STR_MISC.bold) : pickLang(lang, STR_MISC.notBold);
    case 'size':
      return localizedSizeLabel(lang, value as number);
    case 'number':
      return `${value}${field.unit || ''}`;
    case 'select':
      return field.options?.find((option) => option.value === value)?.label || String(value);
    default:
      return String(value);
  }
}
