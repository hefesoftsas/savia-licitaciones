// Pure validation shared by the Worker and runner. IDs are stable program
// identifiers; model-supplied numbering, headings and extra sections are rejected.
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,expected)=>record(value)&&Object.keys(value).length===expected.length&&expected.every(key=>Object.hasOwn(value,key));
const invalid=()=>{throw new Error('Planificación de capítulos inválida.');};
export function validateTechnicalContentPlans(value,targetIds,knowledgeIds){
 if(!Array.isArray(targetIds)||!targetIds.length||targetIds.some(id=>typeof id!=='string'||!id)||new Set(targetIds).size!==targetIds.length||!Array.isArray(knowledgeIds)||knowledgeIds.some(id=>typeof id!=='string'||!id)||!keys(value,['plans'])||!Array.isArray(value.plans)||value.plans.length!==targetIds.length)invalid();
 const targets=new Set(targetIds),allowed=new Set(knowledgeIds),byId=new Map();
 for(const entry of value.plans){
  if(!keys(entry,['id','content_plan'])||typeof entry.id!=='string'||!targets.has(entry.id)||byId.has(entry.id))invalid();
  const plan=entry.content_plan;
  if(!keys(plan,['writing_focus','target_words','knowledge','table','image_suitability_score'])||typeof plan.writing_focus!=='string'||!plan.writing_focus.trim()||plan.writing_focus.length>2000||!Number.isSafeInteger(plan.target_words)||plan.target_words<0||plan.target_words>100000||!Number.isInteger(plan.image_suitability_score)||plan.image_suitability_score<0||plan.image_suitability_score>10)invalid();
  if(!keys(plan.knowledge,['item_ids'])||!Array.isArray(plan.knowledge.item_ids)||plan.knowledge.item_ids.some(id=>typeof id!=='string'||!allowed.has(id))||new Set(plan.knowledge.item_ids).size!==plan.knowledge.item_ids.length)invalid();
  if(!keys(plan.table,['needed','purpose'])||typeof plan.table.needed!=='boolean'||typeof plan.table.purpose!=='string'||plan.table.purpose.length>2000||(plan.table.needed&&!plan.table.purpose.trim())||(!plan.table.needed&&plan.table.purpose.trim()))invalid();
  byId.set(entry.id,entry);
 }
 return targetIds.map(id=>byId.get(id));
}
export function validateTechnicalPlanningOptions(options){
 const extended=keys(options,['sectionWords','maxTables','minimumWords','maximumWords']);
 if((!extended&&!keys(options,['sectionWords','maxTables']))||!Number.isSafeInteger(options.sectionWords)||options.sectionWords<0||options.sectionWords>100000||(options.maxTables!==null&&(!Number.isSafeInteger(options.maxTables)||options.maxTables<0||options.maxTables>500)))invalid();
 if(extended&&(!Number.isSafeInteger(options.minimumWords)||options.minimumWords<0||options.minimumWords>100000||!Number.isSafeInteger(options.maximumWords)||options.maximumWords<0||options.maximumWords>100000||(options.minimumWords>0&&options.maximumWords>0&&options.minimumWords>options.maximumWords)))invalid();
 return extended?{sectionWords:options.sectionWords,maxTables:options.maxTables,minimumWords:options.minimumWords,maximumWords:options.maximumWords}:{sectionWords:options.sectionWords,maxTables:options.maxTables};
}
export function applyTechnicalPlanningOptions(plans,options,totalSections=plans.length,existingWords){
 const settings=validateTechnicalPlanningOptions(options),candidates=plans.filter(item=>item.content_plan.table.needed),limit=settings.maxTables,selected=new Set();
 if(limit===null||candidates.length<=limit)candidates.forEach(item=>selected.add(item.id));
 else for(let slot=0;slot<limit;slot++){const start=Math.floor(slot*candidates.length/limit),end=Math.floor((slot+1)*candidates.length/limit),group=candidates.slice(start,Math.max(start+1,end));selected.add(group[Math.floor(group.length/2)].id);}
 const min=settings.minimumWords||0,max=settings.maximumWords||0,total=min&&max?Math.round((min+max)/2):Math.round(min?min*1.2:max*0.8);let words=plans.map(()=>settings.sectionWords);
 if(total){if(!Number.isSafeInteger(totalSections)||totalSections<plans.length||!plans.length)invalid();if(existingWords!==undefined&&(!Number.isSafeInteger(existingWords)||existingWords<0))invalid();const budget=existingWords===undefined?Math.round(total*plans.length/totalSections):Math.max(plans.length,total-existingWords);if(existingWords!==undefined&&max&&budget>max-existingWords)invalid();const proposed=plans.map(item=>item.content_plan.target_words);if(budget<plans.length||proposed.some(value=>!Number.isSafeInteger(value)||value<=0))invalid();const sum=proposed.reduce((a,b)=>a+b,0);if(sum===budget)words=proposed;else{const allocations=proposed.map((value,index)=>{const exact=1+(budget-plans.length)*value/sum;return {index,words:Math.floor(exact),fraction:exact-Math.floor(exact)};});const remainder=budget-allocations.reduce((sum,item)=>sum+item.words,0);allocations.sort((a,b)=>b.fraction-a.fraction||a.index-b.index);allocations.forEach((item,index)=>{words[item.index]=item.words+(index<remainder?1:0);});}}
 return plans.map((item,index)=>({...item,content_plan:{...item.content_plan,target_words:words[index],table:selected.has(item.id)?{...item.content_plan.table}:{needed:false,purpose:''}}}));
}
