import {buildTechnicalWordAdjustment} from './technical-word-editable.mjs';
import {createTechnicalWordAdjuster} from './technical-word-adjuster.mjs';
import wordCount from '../client/electron/utils/wordCount.cjs';
import {TaskInputError} from './task-errors.mjs';

export function createTechnicalWordStage({adjust=createTechnicalWordAdjuster()}={}){
 return async(payload,context,decisions)=>{
  const fail=()=>{throw new TaskInputError(payload.language==='en'?'The saved word-adjustment stage is unavailable.':'La etapa guardada de ajuste de extensión no está disponible.');};
  if(payload.wordAdjustment!==true||payload.wordAdjustmentConsent!==true||!(decisions instanceof Map))fail();
  context.signal?.throwIfAborted();const snapshot=await context.getTechnicalBatchContext();
  if(!Array.isArray(snapshot.nodes)||!Array.isArray(snapshot.completedDrafts)||!Array.isArray(snapshot.wordAdjustmentIds)||payload.targets.some(id=>!snapshot.completedDrafts.includes(id)||!decisions.has(id)))fail();
  const nodes=new Map(snapshot.nodes.map(node=>[node.id,node])),loaded=new Map();let size=0;
  const getSection=async id=>{if(loaded.has(id))return loaded.get(id);context.signal?.throwIfAborted();const section=await context.getTechnicalBatchSection(id),node=nodes.get(id);if(!node||!section||section.id!==id||section.title!==node.title||section.reference!==false||typeof section.content!=='string'||!section.content.trim()||section.content.length>200000)fail();size+=section.content.length;if(size>20000000)fail();loaded.set(id,section);return section;};
  let plan=snapshot.wordPlan;
  if(!snapshot.wordPlanSaved){const chapters=[];for(const id of payload.targets){const chapter=await getSection(id);chapters.push({...chapter,targetWords:decisions.get(id).target_words});}plan=buildTechnicalWordAdjustment(payload,chapters);context.signal?.throwIfAborted();await context.saveTechnicalBatchWordPlan(plan);}
  if(plan!==null&&(!plan||!Array.isArray(plan.jobs)))fail();const jobs=plan?.jobs||[],allowed=new Set(jobs.map(item=>item.nodeId)),saved=new Set(snapshot.wordAdjustmentIds);if(allowed.size!==jobs.length||saved.size!==snapshot.wordAdjustmentIds.length||[...saved].some(id=>!allowed.has(id)))fail();
  for(const job of jobs){context.signal?.throwIfAborted();if(saved.has(job.nodeId))continue;if(!payload.targets.includes(job.nodeId)||!Number.isSafeInteger(job.targetWords)||job.targetWords<1)fail();const chapter=await getSection(job.nodeId);if(wordCount.countReadableWords(chapter.content)!==job.fromWords)fail();const result=await adjust(payload,context,{chapter,targetWords:job.targetWords});context.signal?.throwIfAborted();if(typeof result?.content!=='string'||!result.content.trim())fail();await context.saveTechnicalBatchWordAdjustment(job.nodeId,job.targetWords,result.content);}
  return plan;
 };
}
