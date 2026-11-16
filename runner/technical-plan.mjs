import { createTenderChatHandler } from './tender-chat.mjs';
import { TaskInputError } from './task-errors.mjs';
import {validateTechnicalContentPlans} from './technical-content-planning.mjs';

export function createTechnicalPlanHandler(options = {}) {
  const draft = createTenderChatHandler(options);
  return async (payload, context) => {
    const en = payload?.language === 'en';
    if (payload?.dataProcessingConsent !== true) throw new TaskInputError(en ? 'Consent is required to send documents to the AI provider.' : 'Se requiere consentimiento para enviar documentos al proveedor de IA.');
    const knowledgeIds = payload.knowledgeSnapshot?.ids || [];
    if (payload.includeKnowledgeDocuments === true && (payload.knowledgeDocumentConsent !== true || !knowledgeIds.length || payload.knowledgeConsent !== true)) throw new TaskInputError(en ? 'Consent is required for the full knowledge documents.' : 'Se requiere consentimiento para los documentos completos de la biblioteca.');
    if (knowledgeIds.length && payload.knowledgeConsent !== true) throw new TaskInputError(en ? 'Consent is required for selected knowledge.' : 'Se requiere consentimiento para el conocimiento seleccionado.');
    context.signal?.throwIfAborted();
    let snapshot;
    try { snapshot = await context.getPlanContext(); }
    catch (error) {
      if (error.status === 409) throw new TaskInputError(en ? 'The plan changed or the task expired. Refresh and create a new draft.' : 'El plan cambió o la tarea venció. Actualiza y crea un nuevo borrador.');
      throw error;
    }
    if (snapshot?.globalFactsIncludeRup && payload.rupConsent !== true) throw new TaskInputError(en ? 'Separate consent is required for RUP-derived facts.' : 'Se requiere consentimiento específico para los hechos derivados del RUP.');
    if (!snapshot?.node || snapshot.node.id !== payload.nodeId) throw new TaskInputError(en ? 'The chapter is unavailable.' : 'El capítulo no está disponible.');
    const allKnowledge = knowledgeIds.length ? snapshot.knowledgeEntries : undefined;
    if (knowledgeIds.length && (!Array.isArray(allKnowledge) || allKnowledge.length !== knowledgeIds.length || new Set(allKnowledge.map(entry => entry.id)).size !== knowledgeIds.length || allKnowledge.some(entry => !knowledgeIds.includes(entry.id)) || JSON.stringify(allKnowledge).length > 250000)) throw new TaskInputError(en ? 'Selected knowledge is unavailable or too large.' : 'El conocimiento seleccionado no está disponible o es demasiado extenso.');
    let contentPlan;
    if (payload.contentPlan !== undefined) { try { contentPlan=validateTechnicalContentPlans({plans:[{id:payload.nodeId,content_plan:payload.contentPlan}]},[payload.nodeId],knowledgeIds)[0].content_plan; } catch { throw new TaskInputError(en?'The saved chapter plan is invalid.':'La planificación guardada del capítulo no es válida.'); } }
    const selectedIds=contentPlan?.knowledge.item_ids;
    const knowledge=allKnowledge && selectedIds ? allKnowledge.filter(entry=>selectedIds.includes(entry.id)) : allKnowledge;
    const contextData = JSON.stringify({ project: snapshot.projectTitle, chapter: snapshot.node, ...(contentPlan?{contentPlan}:{}), approvedGlobalFacts: snapshot.globalFacts || [], ...(knowledge ? { approvedKnowledgeEntries: knowledge } : {}), additionalInstructions: payload.instructions || '' });
    const question = en
      ? `Draft the body of the selected technical proposal chapter in Markdown using the selected tender documents. The following JSON describes the project and user requirements: ${contextData}. Use approved knowledge entries as supporting evidence where relevant; approved global facts take precedence. ${contentPlan ? 'Follow the chapter contentPlan writing focus and word target (zero means no target); use a table only if table.needed is true and its purpose applies. The illustration score is advisory and does not authorize images.' : ''} Do not invent bidder qualifications, commitments, dates, quantities or facts. Mark missing bidder-specific information as [TO BE DEFINED]. Do not include HTML, Mermaid, images or a repeated chapter heading. Return only the reviewable chapter draft.`
      : `Redacta el cuerpo del capítulo seleccionado de la propuesta técnica en Markdown usando los documentos seleccionados. El siguiente JSON describe el proyecto y los requisitos del usuario: ${contextData}. Usa las entradas de conocimiento aprobadas como evidencia cuando sean pertinentes; los hechos globales aprobados tienen prioridad. ${contentPlan ? 'Sigue el enfoque y la meta de palabras del contentPlan (cero significa sin meta); usa una tabla solo si table.needed es verdadero y su propósito aplica. La puntuación de ilustración es orientativa y no autoriza imágenes.' : ''} No inventes experiencia del oferente, compromisos, fechas, cantidades ni hechos. Marca la información específica del oferente que falte como [POR DEFINIR]. No incluyas HTML, Mermaid, imágenes ni repitas el título del capítulo. Devuelve solo el borrador revisable del capítulo.`;
    const knowledgeDocumentIds = payload.includeKnowledgeDocuments === true ? [...new Set((knowledge||[]).map(entry => entry.documentId))] : [];
    if (knowledgeDocumentIds.some(id => typeof id !== 'string' || !id)) throw new TaskInputError(en ? 'Selected knowledge documents are unavailable.' : 'Los documentos seleccionados no están disponibles.');
    const result = await draft({ ...payload, question }, { ...context, knowledgeDocumentIds, includeApprovedKnowledge: !!knowledge || !!snapshot.globalFacts?.length });
    await context.getPlanContext();
    return { content: result.answer };
  };
}
