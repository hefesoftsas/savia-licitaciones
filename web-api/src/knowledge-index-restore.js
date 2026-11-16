import { digest } from './runners.js';

const response = (error,status) => Response.json({error},{status});
const text = (value,max,required=false) => typeof value==='string' && value.length<=max && (!required || !!value.trim());

// Restores an active index only for a document already imported by this runner's account.
export async function restoreKnowledgeIndex(request, env, runner, requestId, sourceKey) {
  if (request.method!=='POST') return new Response('Method not allowed',{status:405});
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId) || !/^[a-f0-9]{64}$/.test(sourceKey)) return response('invalid_input',400);
  let input; try { input=await request.json(); } catch { return response('invalid_input',400); }
  if (!Array.isArray(input?.entries) || !input.entries.length || input.entries.length>500) return response('invalid_input',400);
  const ids=new Set(), entries=[];
  for (const row of input.entries) {
    if (!row || !text(row.id,128,true) || ids.has(row.id) || !text(row.title,300,true) || !text(row.summary,2000,true) || !text(row.quote,10000,true) || !Number.isSafeInteger(row.sortOrder) || row.sortOrder<0) return response('invalid_input',400);
    ids.add(row.id); entries.push({id:row.id,title:row.title,summary:row.summary,quote:row.quote,sortOrder:row.sortOrder});
  }
  const body=JSON.stringify(entries); if(body.length>3000000)return response('too_large',413);
  const hash=await digest(body), owner=runner.ownerId;
  const document=await env.DB.prepare('SELECT i.document_id,d.id AS present,d.deleting,d.missing_reason FROM desktop_knowledge_document_imports i LEFT JOIN knowledge_documents d ON d.id=i.document_id AND d.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=? AND i.source_key=?').bind(owner,requestId,sourceKey).first();
  if (!document) return response('not_found',404);
  if (!document.present || document.deleting || document.missing_reason) return response('source_unavailable',410);
  const prior=async()=>env.DB.prepare('SELECT r.content_hash,r.mapping_json,r.mutation_id,i.mutation_id AS current_mutation FROM knowledge_snapshot_index_receipts r LEFT JOIN knowledge_indices i ON i.document_id=r.document_id AND i.owner_id=r.owner_id WHERE r.owner_id=? AND r.request_id=? AND r.source_key=?').bind(owner,requestId,sourceKey).first();
  const existingResponse=row=>row?.content_hash===hash && row.mutation_id===row.current_mutation ? Response.json({mapping:JSON.parse(row.mapping_json)}) : response('index_conflict',409);
  const previous=await prior(); if(previous)return existingResponse(previous);
  const mutation=crypto.randomUUID(), mapping=entries.map(row=>({sourceId:row.id,id:crypto.randomUUID()}));
  const rows=entries.map((row,index)=>({...row,newId:mapping[index].id}));
  const own='EXISTS (SELECT 1 FROM knowledge_snapshot_index_receipts WHERE owner_id=? AND request_id=? AND source_key=? AND mutation_id=?)';
  const outcome=await env.DB.batch([
    env.DB.prepare('INSERT INTO knowledge_snapshot_index_receipts(owner_id,request_id,source_key,document_id,content_hash,mutation_id,mapping_json) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM knowledge_documents WHERE id=? AND owner_id=? AND deleting=0 AND missing_reason IS NULL) AND NOT EXISTS (SELECT 1 FROM knowledge_indices WHERE document_id=? AND owner_id=?) ON CONFLICT(owner_id,request_id,source_key) DO NOTHING').bind(owner,requestId,sourceKey,document.document_id,hash,mutation,JSON.stringify(mapping),document.document_id,owner,document.document_id,owner),
    env.DB.prepare(`INSERT INTO knowledge_indices(document_id,owner_id,revision,job_id,mutation_id) SELECT ?,?,1,?,? WHERE ${own}`).bind(document.document_id,owner,`restored:${mutation}`,mutation,owner,requestId,sourceKey,mutation),
    env.DB.prepare(`INSERT INTO knowledge_entries(id,document_id,owner_id,title,summary,quote,sort_order) SELECT json_extract(value,'$.newId'),?,?,json_extract(value,'$.title'),json_extract(value,'$.summary'),json_extract(value,'$.quote'),json_extract(value,'$.sortOrder') FROM json_each(?) WHERE ${own}`).bind(document.document_id,owner,JSON.stringify(rows),owner,requestId,sourceKey,mutation),
  ]);
  if(outcome[0].meta.changes)return Response.json({mapping},{status:201});
  return existingResponse(await prior());
}
