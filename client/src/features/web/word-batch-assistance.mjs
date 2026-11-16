export function makeBatches(items,size=20){const result=[];for(let i=0;i<items.length;i+=size)result.push(items.slice(i,i+size));return result;}
export function parseBatchAdvice(answer,allowedIds){
 try{const raw=String(answer).replace(/<suggested_questions>[\s\S]*?<\/suggested_questions>/gi,'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');const values=JSON.parse(raw);if(!Array.isArray(values))return null;const allowed=new Set(allowedIds),seen=new Set(),out=[];for(const item of values){if(!item||!Number.isSafeInteger(item.id)||!allowed.has(item.id)||seen.has(item.id)||typeof item.proposal!=='string'||typeof item.source!=='string'||typeof item.question!=='string')continue;seen.add(item.id);const source=item.source.trim().slice(0,1000);out.push({id:item.id,proposal:source?item.proposal.trim().slice(0,4000):'',source,question:item.question.trim().slice(0,1000)});}return out;}catch{return null;}
}
export function replaceWordMatch(editor,match,value){
 const result=editor.exec({type:'replaceMatch',match,text:value});
 return !!(result.ok&&result.changed)||!!(!result.ok&&result.code==='unsupported'&&editor.surface&&editor.selectMatch(match).ok&&editor.surface.pasteRich(value,null));
}
export function applyBatchAdvice(editor,fields,items,selectedRevision,currentRevision){
 if(!editor||selectedRevision!==currentRevision)return {applied:0,failed:0,stale:true};
 const ordered=items.filter(item=>item.proposal?.trim()&&fields[item.id]).sort((a,b)=>{const x=fields[a.id],y=fields[b.id];return (y.paragraphIndex??0)-(x.paragraphIndex??0)||y.start-x.start;});let applied=0,failed=0;
 for(const item of ordered){if(replaceWordMatch(editor,fields[item.id],item.proposal.trim()))applied++;else failed++;}
 return {applied,failed,stale:false};
}
