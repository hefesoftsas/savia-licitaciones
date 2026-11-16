import {digest} from './runners.js';

class SubmissionCaptureError extends Error{}
const fail=()=>{throw new SubmissionCaptureError('El seguimiento cambió o sus archivos no están disponibles.');};
const fileColumns={attachments:'f.id,f.project_id,f.request_id,f.name,f.content_type,f.size,f.sha256,f.object_key,f.created_at',evidence:'f.id,f.project_id,f.submission_id,f.role,f.name,f.content_type,f.size,f.sha256,f.object_key,f.created_at'};
const fileTable={attachments:'project_submission_attachments',evidence:'project_submission_evidence'};
const version=(row,etag)=>digest(JSON.stringify([row,etag]));
async function rows(env,owner,project){
 const [projects,requests,results,submissions,attachments,evidence]=await env.DB.batch([
  env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(project,owner),
  env.DB.prepare('SELECT r.id,r.kind,r.title,r.due_date,r.note,r.status,r.task_id,r.version,r.created_at,r.updated_at FROM project_submission_requests r JOIN projects p ON p.id=r.project_id WHERE p.id=? AND p.owner_id=? ORDER BY r.id').bind(project,owner),
  env.DB.prepare('SELECT r.id,r.result,r.note,r.created_at FROM project_submission_results r JOIN projects p ON p.id=r.project_id WHERE p.id=? AND p.owner_id=? ORDER BY r.id').bind(project,owner),
  env.DB.prepare('SELECT r.id,r.submitted_on,r.reference,r.version,r.note,r.created_at,r.missing_roles FROM project_submission_records r JOIN projects p ON p.id=r.project_id WHERE p.id=? AND p.owner_id=? ORDER BY r.id').bind(project,owner),
  env.DB.prepare(`SELECT ${fileColumns.attachments} FROM project_submission_attachments f JOIN projects p ON p.id=f.project_id WHERE p.id=? AND p.owner_id=? ORDER BY f.id`).bind(project,owner),
  env.DB.prepare(`SELECT ${fileColumns.evidence} FROM project_submission_evidence f JOIN projects p ON p.id=f.project_id WHERE p.id=? AND p.owner_id=? ORDER BY f.id`).bind(project,owner),
 ]);return projects.results.length?{requests:requests.results,results:results.results,submissions:submissions.results,attachments:attachments.results,evidence:evidence.results}:null;
}
const publicFile=(row,etag,revision)=>({id:row.id,...(row.request_id!==undefined?{requestId:row.request_id}:{submissionId:row.submission_id,role:row.role}),name:row.name,contentType:row.content_type,size:row.size,sha256:row.sha256,createdAt:row.created_at,etag,version:revision});
async function prepare(env,owner,project){
 const original=await rows(env,owner,project);if(!original)return null;
 if(Object.values(original).some(list=>list.length>10000))fail();const requests=new Set(original.requests.map(row=>row.id)),submissions=new Set(original.submissions.map(row=>row.id)),roles=new Map(),objects=[];
 for(const file of original.attachments)if(!requests.has(file.request_id))fail();
 for(const file of original.evidence){if(!submissions.has(file.submission_id)||!['package','receipt'].includes(file.role))fail();const set=roles.get(file.submission_id)||new Set();if(set.has(file.role))fail();set.add(file.role);roles.set(file.submission_id,set);}
 const missingById=new Map();for(const row of original.submissions){let missing;try{missing=JSON.parse(row.missing_roles);}catch{fail();}if(!Array.isArray(missing)||missing.some(role=>!['package','receipt'].includes(role))||new Set(missing).size!==missing.length||['package','receipt'].some(role=>missing.includes(role)===!!roles.get(row.id)?.has(role)))fail();missingById.set(row.id,missing);}
 const publicFiles={attachments:[],evidence:[]};for(const kind of ['attachments','evidence'])for(const row of original[kind]){if(!Number.isSafeInteger(row.size)||row.size<0||row.size>256*1024*1024||!/^[a-f0-9]{64}$/.test(row.sha256||''))fail();const object=await env.FILES.head(row.object_key);if(!object||object.size!==row.size)fail();objects.push({kind,id:row.id,key:row.object_key,size:row.size,etag:object.etag});publicFiles[kind].push(publicFile(row,object.etag,await version(row,object.etag)));}
 const revision=await digest(JSON.stringify({rows:original,objects}));
 return {revision,requests:original.requests.map(row=>({id:row.id,kind:row.kind,title:row.title,dueDate:row.due_date,note:row.note,status:row.status,taskId:row.task_id,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at})),results:original.results.map(row=>({id:row.id,result:row.result,note:row.note,createdAt:row.created_at})),submissions:original.submissions.map(row=>({id:row.id,date:row.submitted_on,reference:row.reference,version:row.version,note:row.note,createdAt:row.created_at,missingRoles:missingById.get(row.id)})),...publicFiles,async assertUnchanged(){if(JSON.stringify(await rows(env,owner,project))!==JSON.stringify(original))fail();for(const item of objects){const current=await env.FILES.head(item.key);if(!current||current.size!==item.size||current.etag!==item.etag)fail();}}};
}
async function openFile(env,owner,project,kind,id,etag,expected){
 if(!Object.hasOwn(fileTable,kind))return null;
 const row=await env.DB.prepare(`SELECT ${fileColumns[kind]} FROM ${fileTable[kind]} f JOIN projects p ON p.id=f.project_id WHERE p.id=? AND p.owner_id=? AND f.id=?`).bind(project,owner,id).first();if(!row)return null;
 if(typeof etag!=='string'||!etag||!/^[a-f0-9]{64}$/.test(expected||'')||await version(row,etag)!==expected)fail();
 const object=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:etag}});if(!object?.body||object.etag!==etag||object.size!==row.size)fail();return object.body;
}
export async function runnerSubmissionCapture(request,env,runner,project,kind,id){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{if(kind&&id){const params=new URL(request.url).searchParams,body=await openFile(env,runner.ownerId,project,kind,id,params.get('etag'),params.get('version'));return body?new Response(body,{headers:{'content-type':'application/octet-stream','x-content-type-options':'nosniff'}}):Response.json({error:'not_found'},{status:404});}
  const capture=await prepare(env,runner.ownerId,project);if(!capture)return Response.json({error:'not_found'},{status:404});await capture.assertUnchanged();const {assertUnchanged,...output}=capture;return Response.json(output);
 }catch(error){if(error instanceof SubmissionCaptureError)return Response.json({error:'source_unavailable'},{status:409});throw error;}
}
