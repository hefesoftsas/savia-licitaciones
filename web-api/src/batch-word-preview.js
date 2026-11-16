import {digest} from './runners.js';

export async function loadBatchWordPreview(env,ownerId,projectId,batchId,version){
 if(typeof batchId!=='string'||!batchId||batchId.length>128)return null;
 const batch=await env.DB.prepare("SELECT payload_json FROM jobs WHERE id=? AND project_id=? AND owner_id=? AND kind='technical-plan.generate-batch' AND state IN ('succeeded','failed','interrupted','cancelled')").bind(batchId,projectId,ownerId).first();
 if(!batch||JSON.parse(batch.payload_json).planVersion!==version)return null;
 const {results}=await env.DB.prepare('SELECT node_id AS id,content FROM technical_batch_drafts WHERE job_id=? AND project_id=? AND owner_id=? ORDER BY node_id').bind(batchId,projectId,ownerId).all();
 if(!results.length)return null;
 return {drafts:results,fingerprint:await digest(JSON.stringify(results))};
}
export function previewOutline(outline,drafts){
 const content=new Map(drafts.map(d=>[d.id,d.content]));
 return outline.map(node=>({...node,...(content.has(node.id)?{content:content.get(node.id)}:{}),...(node.children?{children:previewOutline(node.children,drafts)}:{})}));
}
