import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';
import {repairSubmissionEvidence} from './submission-evidence-repair.js';

const missing=()=>Response.json({error:'not_found'},{status:404});
const bad=()=>Response.json({error:'invalid_input'},{status:400});
const conflict=()=>Response.json({error:'source_changed'},{status:409});
const text=(value,max)=>typeof value==='string'&&value.length<=max;
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');
async function checksum(body){const digest=new crypto.DigestStream('SHA-256');await body.pipeTo(digest);return Array.from(new Uint8Array(await digest.digest),byte=>byte.toString(16).padStart(2,'0')).join('');}
const fileView=row=>({id:row.id,name:row.name,contentType:row.content_type,size:row.size,sha256:row.sha256,createdAt:row.created_at});
export function formatSubmissionRecords(records,files){
 const grouped=new Map();for(const file of files){const entry=grouped.get(file.submission_id)||{};entry[file.role]=fileView(file);grouped.set(file.submission_id,entry);}
 return records.map(row=>({id:row.id,date:row.submitted_on,reference:row.reference,version:row.version,note:row.note,createdAt:row.created_at,missingRoles:JSON.parse(row.missing_roles||'[]'),...grouped.get(row.id)}));
}
export async function submissionRecordsForProject(env,projectId){
 const [records,files]=await env.DB.batch([env.DB.prepare('SELECT * FROM project_submission_records WHERE project_id=? ORDER BY created_at DESC,id DESC').bind(projectId),env.DB.prepare('SELECT * FROM project_submission_evidence WHERE project_id=? ORDER BY created_at,id').bind(projectId)]);
 return formatSubmissionRecords(records.results,files.results);
}
async function findRecord(env,projectId,key){return env.DB.prepare('SELECT * FROM project_submission_records WHERE project_id=? AND request_key=?').bind(projectId,key).first();}
export async function submissionRecords(request,env,owner,projectId,submissionId,role){
 const project=await env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(projectId,owner).first();if(!project)return missing();
 if(request.method==='GET'&&submissionId&&['package','receipt'].includes(role)){
  const file=await env.DB.prepare('SELECT * FROM project_submission_evidence WHERE project_id=? AND submission_id=? AND role=?').bind(projectId,submissionId,role).first();if(!file)return missing();
  const source=await env.FILES.get(file.object_key);if(!source?.body||source.size!==file.size||await checksum(source.body)!==file.sha256)return Response.json({error:'file_integrity'},{status:409});
  const verified=await env.FILES.get(file.object_key,{onlyIf:{etagMatches:source.etag}});if(!verified?.body||verified.size!==file.size)return conflict();const name=encodeURIComponent(file.name).replace(/['()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(verified.body,{headers:{'content-type':file.content_type,'content-disposition':`attachment; filename*=UTF-8''${name}`,'x-content-type-options':'nosniff'}});
 }
 if(request.method==='POST'&&submissionId&&['package','receipt'].includes(role))return repairSubmissionEvidence(request,env,owner,projectId,submissionId,role);
 if(request.method!=='POST'||submissionId)return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return bad();}const key=request.headers.get('idempotency-key');
 if(!key||!/^[A-Za-z0-9._:-]{1,128}$/.test(key)||!date(input?.date)||!text(input?.reference,300)||!input.reference.trim()||!text(input?.version,300)||!input.version.trim()||!text(input?.note??'',20000)||!text(input?.packageFileId,128)||!input.packageFileId||!text(input?.receiptFileId,128)||!input.receiptFileId)return bad();
 const payloadHash=await hash([input.date,input.reference.trim(),input.version.trim(),(input.note||'').trim(),input.packageFileId,input.receiptFileId]);
 const replay=async()=>{const row=await findRecord(env,projectId,key);if(!row)return null;if(row.payload_hash!==payloadHash)return Response.json({error:'idempotency_conflict'},{status:409});const item=(await submissionRecordsForProject(env,projectId)).find(record=>record.id===row.id);if(!item?.package||!item?.receipt)throw new Error('Incomplete submission record.');return Response.json({item});};
 const previous=await replay();if(previous)return previous;
 const sourceRows=await Promise.all([input.packageFileId,input.receiptFileId].map(id=>env.DB.prepare('SELECT id,name,content_type,object_key,size FROM project_files WHERE id=? AND project_id=?').bind(id,projectId).first()));if(sourceRows.some(row=>!row))return missing();
 if(sourceRows.some(row=>!Number.isSafeInteger(row.size)||row.size<0)||sourceRows.reduce((sum,row)=>sum+row.size,0)>256*1024*1024)return Response.json({error:'files_too_large'},{status:413});
 try{await cleanupDesktopUploads(env,owner);}catch{/* Retry later. */}
 const id=crypto.randomUUID(),createdAt=new Date().toISOString(),stages=[],copies=[];let published=false;
 try{
  for(const [i,sourceRow] of sourceRows.entries()){
   const object=await env.FILES.get(sourceRow.object_key);if(!object?.body||object.size!==sourceRow.size)return conflict();
   const stage={id:crypto.randomUUID(),key:`submission-evidence/${projectId}/${crypto.randomUUID()}`};await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(stage.id,owner,stage.key,Date.now()+uploadLeaseMs,Date.now()).run();stages.push(stage);
   const fixed=new FixedLengthStream(sourceRow.size);const [stored]=await Promise.all([env.FILES.put(stage.key,fixed.readable),object.body.pipeTo(fixed.writable)]);if(!stored||stored.size!==sourceRow.size)throw new Error('Evidence copy failed.');
   await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(stage.id,owner).run();const copy=await env.FILES.get(stage.key);if(!copy?.body||copy.size!==sourceRow.size)throw new Error('Evidence copy unavailable.');const sha256=await checksum(copy.body);
   const current=await env.FILES.head(sourceRow.object_key);if(!current||current.etag!==object.etag||current.size!==sourceRow.size)return conflict();copies.push({id:crypto.randomUUID(),role:i===0?'package':'receipt',source:sourceRow,stage,sha256});
  }
  const now=Date.now(),guard="EXISTS(SELECT 1 FROM projects WHERE id=? AND owner_id=?) AND EXISTS(SELECT 1 FROM project_files WHERE id=? AND project_id=? AND object_key=? AND size=?) AND EXISTS(SELECT 1 FROM project_files WHERE id=? AND project_id=? AND object_key=? AND size=?) AND EXISTS(SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?) AND EXISTS(SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?)";
  const [a,b]=copies;const batch=await env.DB.batch([
   env.DB.prepare(`INSERT INTO project_submission_records(id,project_id,submitted_on,reference,version,note,request_key,payload_hash,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(project_id,request_key) DO NOTHING`).bind(id,projectId,input.date,input.reference.trim(),input.version.trim(),(input.note||'').trim(),key,payloadHash,createdAt,projectId,owner,a.source.id,projectId,a.source.object_key,a.source.size,b.source.id,projectId,b.source.object_key,b.source.size,a.stage.id,owner,now,b.stage.id,owner,now),
   ...copies.map(copy=>env.DB.prepare('INSERT INTO project_submission_evidence(id,project_id,submission_id,role,name,content_type,size,sha256,object_key,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM project_submission_records WHERE id=? AND project_id=?)').bind(copy.id,projectId,id,copy.role,copy.source.name,copy.source.content_type,copy.source.size,copy.sha256,copy.stage.key,createdAt,id,projectId)),
   ...copies.map(copy=>env.DB.prepare("DELETE FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND EXISTS(SELECT 1 FROM project_submission_evidence WHERE id=? AND object_key=?)").bind(copy.stage.id,owner,copy.id,copy.stage.key)),
  ]);
  if(!batch[0].meta.changes){const existing=await replay();return existing||conflict();}
  published=true;const item=(await submissionRecordsForProject(env,projectId)).find(record=>record.id===id);if(!item?.package||!item?.receipt)throw new Error('Incomplete submission record.');return Response.json({item},{status:201});
 }finally{if(!published){for(const stage of stages){try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(stage.id,owner).run();}catch{/* Preserve staging for later cleanup. */}}try{await cleanupDesktopUploads(env,owner);}catch{/* Preserve staging for later cleanup. */}}}
}
