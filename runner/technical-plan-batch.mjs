import {createTechnicalPlanHandler} from './technical-plan.mjs';
import {TaskInputError} from './task-errors.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {validateTechnicalContentPlans,applyTechnicalPlanningOptions} from './technical-content-planning.mjs';
import {createTechnicalContentPlanner} from './technical-content-planner.mjs';
import {createTechnicalConsistencyReviewer,validateTechnicalConsistency} from './technical-consistency.mjs';
import {createTechnicalWordStage} from './technical-word-stage.mjs';

// Every completed chapter is acknowledged by the server before moving to the next.
// The context endpoint revalidates the plan and selected sources under the lease.
export function createTechnicalPlanBatchHandler({draft=createTechnicalPlanHandler(),plan=createTechnicalContentPlanner(),consistency=createTechnicalConsistencyReviewer(),wordAdjustment=createTechnicalWordStage()}={}){
 return async(payload,context)=>{
  const en=payload?.language==='en',fail=(es,english)=>{throw new TaskInputError(en?english:es);};
  if(payload?.dataProcessingConsent!==true)fail('Se requiere consentimiento para generar capítulos.','Consent is required to generate chapters.');
  if(payload.consistency===true&&payload.consistencyConsent!==true)fail('Se requiere consentimiento para revisar la coherencia.','Consent is required to review consistency.');
  if(payload.consistencyLedger===true&&(payload.consistency!==true||payload.ledgerConsent!==true))fail('Se requiere consentimiento para la comprobación por capítulos.','Consent is required for per-chapter checks.');
  if(!Array.isArray(payload.targets)||!payload.targets.length||payload.targets.some(id=>typeof id!=='string'||!id)||new Set(payload.targets).size!==payload.targets.length)fail('La selección de capítulos no es válida.','The chapter selection is invalid.');
  context.signal?.throwIfAborted();const snapshot=await context.getTechnicalBatchContext();
  if(!Array.isArray(snapshot?.nodes)||!Array.isArray(snapshot.completedDrafts))fail('Los capítulos no están disponibles.','The chapters are unavailable.');
  const nodes=new Map(snapshot.nodes.map(node=>[node.id,node])),completed=new Set(snapshot.completedDrafts);
  if(nodes.size!==snapshot.nodes.length||payload.targets.some(id=>!nodes.has(id))||[...completed].some(id=>!payload.targets.includes(id)))fail('Los capítulos cambiaron o no están disponibles.','The chapters changed or are unavailable.');
  let decisions;
  if(payload.planning===true){
   let value=snapshot.contentPlans?{plans:snapshot.contentPlans}:null;
   if(!value){
    if(completed.size)fail('La planificación guardada no está disponible.','The saved plan is unavailable.');
    const questionScope=randomUUID(),askUser=(question,signal)=>{const key=createHash('sha256').update(String(question.tool_call_id||randomUUID())).digest('hex');return context.askUser({...question,tool_call_id:`${questionScope}:${key}`},signal);};
    value=await plan(payload,{...context,askUser},snapshot);context.signal?.throwIfAborted();
    let checked=validateTechnicalContentPlans(value,payload.targets,payload.knowledgeSnapshot?.ids||[]);if(payload.planningOptions)checked=applyTechnicalPlanningOptions(checked,payload.planningOptions,payload.totalSections,payload.existingWords);await context.saveTechnicalBatchPlans({plans:checked});value={plans:checked};
   }
   decisions=new Map(validateTechnicalContentPlans(value,payload.targets,payload.knowledgeSnapshot?.ids||[]).map(item=>[item.id,item.content_plan]));
  }
  for(const id of payload.targets){
   context.signal?.throwIfAborted();if(completed.has(id))continue;
   const getPlanContext=async()=>{const current=await context.getTechnicalBatchContext(),node=current.nodes?.find(item=>item.id===id);if(!node)fail('El capítulo ya no está disponible.','The chapter is no longer available.');return {...current,node};};
   const questionScope=randomUUID(),askUser=(question,signal)=>{const key=createHash('sha256').update(String(question.tool_call_id||randomUUID())).digest('hex');return context.askUser({...question,tool_call_id:`${questionScope}:${key}`},signal);};
   const chapter=snapshot.nodes?.find(item=>item.id===id)?.title||id;
   context.reportActivity?.('chapter.start',{chapter,index:payload.targets.indexOf(id)+1,total:payload.targets.length});
   const result=await draft({...payload,nodeId:id,...(decisions?{contentPlan:decisions.get(id)}:{})},{...context,getPlanContext,askUser});context.signal?.throwIfAborted();
   if(typeof result?.content!=='string'||!result.content.trim()||result.content.length>200000)fail('No se obtuvo un capítulo válido.','No valid chapter was produced.');
   await context.saveTechnicalBatchDraft(id,result.content);completed.add(id);context.reportActivity?.('chapter.end',{chapter,index:payload.targets.indexOf(id)+1,total:payload.targets.length});
  }
  if(payload.wordAdjustment===true){if(payload.wordAdjustmentConsent!==true||!decisions)fail('No está disponible el ajuste de extensión.','Word adjustment is unavailable.');await wordAdjustment(payload,context,decisions);}
  context.signal?.throwIfAborted();const current=await context.getTechnicalBatchContext();
  if(payload.consistency===true){let input=current.consistencyInput;
   if(payload.consistencyLedger===true){const manifest=current.consistencyManifest;if(!manifest||!Array.isArray(manifest.chapters)||!Array.isArray(manifest.references)||manifest.chapters.length!==payload.targets.length||manifest.chapters.some((item,index)=>item?.id!==payload.targets[index])||typeof context.getTechnicalBatchSection!=='function')fail('No están disponibles los capítulos para revisar.','The chapters are unavailable for review.');const ids=[...manifest.chapters,...manifest.references].map(item=>item?.id);if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length||ids.length>500)fail('Los capítulos cambiaron o no están disponibles.','The chapters changed or are unavailable.');let size=JSON.stringify(manifest.globalFacts||[]).length;const load=async(items,reference)=>{const loaded=[];for(const item of items){context.signal?.throwIfAborted();const section=await context.getTechnicalBatchSection(item.id,'consistency');if(!section||section.id!==item.id||section.title!==item.title||section.reference!==reference||typeof section.content!=='string'||!section.content.trim()||section.content.length>200000)fail('Un capítulo ya no está disponible.','A chapter is unavailable.');size+=section.content.length+section.title.length+section.id.length;if(size>20000000)fail('Los capítulos son demasiado extensos.','The chapters are too large.');loaded.push({id:section.id,title:section.title,content:section.content});}return loaded;};input={chapters:await load(manifest.chapters,false),references:await load(manifest.references,true),globalFacts:manifest.globalFacts||[]};}
   if(!input||!Array.isArray(input.chapters)||!Array.isArray(input.references)||input.chapters.length!==payload.targets.length)fail('No están disponibles los capítulos para revisar.','The chapters are unavailable for review.');
   if(payload.consistencyLedger===true&&(!Array.isArray(current.consistencyLedgerIds)||typeof context.getTechnicalBatchLedger!=='function'))fail('No están disponibles los puntos de control.','Checkpoints are unavailable.');let review=current.consistencyReview;if(!review){let savedLedger=[];if(payload.consistencyLedger===true){const allowed=new Set([...input.chapters,...input.references].map(item=>item.id));if(new Set(current.consistencyLedgerIds).size!==current.consistencyLedgerIds.length||current.consistencyLedgerIds.some(id=>!allowed.has(id)))fail('Los puntos de control no son válidos.','Checkpoints are invalid.');for(const id of current.consistencyLedgerIds){context.signal?.throwIfAborted();const entry=await context.getTechnicalBatchLedger(id);if(!entry||entry.id!==id)fail('Un punto de control no está disponible.','A checkpoint is unavailable.');savedLedger.push(entry);}}const questionScope=randomUUID(),askUser=(question,signal)=>{const key=createHash('sha256').update(String(question.tool_call_id||randomUUID())).digest('hex');return context.askUser({...question,tool_call_id:`${questionScope}:${key}`},signal);};review=await consistency(payload,{...context,askUser},{...input,...(payload.consistencyLedger===true?{savedLedger}:{})});context.signal?.throwIfAborted();review=validateTechnicalConsistency(review,payload.targets,input.references.map(item=>item.id),input.chapters);await context.saveTechnicalBatchConsistency(review);}
   else validateTechnicalConsistency(review,payload.targets,input.references.map(item=>item.id),input.chapters);
  }
  return {generatedCount:completed.size};
 };
}
