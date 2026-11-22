import { createTenderChatHandler } from './tender-chat.mjs';
import { TaskInputError } from './task-errors.mjs';

const instructions = {
  es: {
    'project-overview': 'Extrae un resumen del proyecto: objeto, antecedentes, alcance, presupuesto, plazos, entregables y características técnicas. Señala qué datos no aparecen en los documentos. Documenta cada actuación del pliego por separado, con unidad, cantidad, precio unitario, importe sin y con impuestos si constan, y referencia a tabla o apartado. Identifica la facturación mínima y su ejercicio, así como cualquier regla expresa sobre ofertas anormalmente bajas. Mantén la terminología y menciona la fuente de cada dato.',
    'technical-score': 'Extrae los criterios de puntuación técnica que requieren respuesta en la propuesta: nombre, puntaje o peso, reglas detalladas y ubicación en el documento. Distingue las reglas generales de evaluación de los criterios concretos, conserva el orden y no inventes puntuaciones. Si no hay criterios técnicos identificables, indícalo expresamente sin asumir que no existen.',
    'response-requirements': 'Extrae la composición y el orden de los documentos de respuesta exigidos: partes, formatos, anexos, firmas y requisitos de presentación. Distingue lo obligatorio de lo opcional solo cuando el documento lo indique. Identifica los formatos y campos de plantillas y menciona la fuente. Si no aparece la composición, indícalo expresamente.',
  },
  en: {
    'project-overview': 'Extract a project overview: purpose, background, scope, budget, timelines, deliverables and technical features. Mark information absent from the documents. List each required activity separately with its unit, quantity, unit price, amounts before and after tax if stated, and table or section. Identify minimum turnover and its fiscal year, and any explicit rules on abnormally low bids. Preserve terminology and cite each source.',
    'technical-score': 'Extract technical scoring criteria requiring a proposal response: name, score or weight, detailed rules and document location. Separate general evaluation rules from concrete criteria, preserve their order and do not invent scores. If no technical criteria are identifiable, say so without assuming none exist.',
    'response-requirements': 'Extract the required response document structure and order: sections, formats, attachments, signatures and submission requirements. Distinguish mandatory and optional items only when stated. Identify templates and fields and cite the source. Say explicitly if the structure is not found.',
  },
};
export function createTechnicalAnalysisHandler({ createDraft = createTenderChatHandler, ...options } = {}) {
  const draft = createDraft(options);
  return async (payload, context) => {
    const en = payload?.language === 'en', question = instructions[en ? 'en' : 'es'][payload?.category];
    if (!question) throw new TaskInputError(en ? 'Unknown analysis.' : 'Análisis desconocido.');
    if (payload?.dataProcessingConsent !== true) throw new TaskInputError(en ? 'Consent is required.' : 'Se requiere consentimiento.');
    if (!Array.isArray(payload.fileIds) || !payload.fileIds.length) throw new TaskInputError(en ? 'Select documents.' : 'Selecciona documentos.');
    const checkSources = async () => { try { await context.assertRequirementSources(); } catch (error) { if (error.status === 409) throw new TaskInputError(en ? 'The source documents changed or the task expired.' : 'Los documentos fuente cambiaron o la tarea venció.'); throw error; } };
    context.signal?.throwIfAborted();
    await checkSources();
    const bidRules = payload.category==='response-requirements' ? `
At the end add a fenced json block with {"bidDocuments":{"separate":true,"economicAnnex":5,"pageLimit":25,"format":{"font":"Arial","fontSize":10.5,"lineSpacing":1.10,"margin":2}}}. Values here are examples. Replace them with verified facts from the tender. Use separate:true only if the technical narrative and the economic offer must be submitted in separate files, parts or envelopes. economicAnnex is the integer number of the official economic offer form, not the scoring annex. pageLimit is the limit of the main technical narrative, excluding any supplementary annex. Use null when the annex number or page limit is absent. Format values are the documented font, point size, line spacing multiplier and uniform minimum margin in centimetres. Omit unverified format properties. Include this block even if separate is false.` : '';
    const result = await draft({ ...payload, question:question+bidRules }, context);
    context.signal?.throwIfAborted();
    await checkSources();
    if (typeof result?.answer !== 'string' || !result.answer.trim() || result.answer.length > 200_000) throw new TaskInputError(en ? 'The analysis is empty or too long.' : 'El análisis está vacío o es demasiado largo.');
    return { content: result.answer.trim() };
  };
}
