import {formatSubmissionRecords} from './submission-records.js';
const missing=()=>Response.json({error:'not_found'},{status:404});
const bad=()=>Response.json({error:'invalid_input'},{status:400});
const conflict=()=>Response.json({error:'version_conflict'},{status:409});
const validDate=value=>value===''||(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value);
const text=(value,max)=>typeof value==='string'&&value.length<=max;
const requestView=row=>({id:row.id,kind:row.kind,title:row.title,dueDate:row.due_date,note:row.note,status:row.status,taskId:row.task_id,taskAvailable:!!row.task_available,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at});
const resultView=row=>({id:row.id,result:row.result,note:row.note,createdAt:row.created_at});
const requestsSql='SELECT r.*,CASE WHEN t.id IS NULL THEN 0 ELSE 1 END AS task_available FROM project_submission_requests r LEFT JOIN project_tasks t ON t.id=r.task_id AND t.project_id=r.project_id WHERE r.project_id=?';
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');
export async function submissionTracking(request,env,ownerId,projectId,kind,itemId){
 const project=await env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(projectId,ownerId).first();if(!project)return missing();
 if(request.method==='GET'&&!kind){const [requests,results,files,submissions,evidence]=await env.DB.batch([env.DB.prepare(`${requestsSql} ORDER BY r.created_at DESC,r.id DESC`).bind(projectId),env.DB.prepare('SELECT * FROM project_submission_results WHERE project_id=? ORDER BY created_at DESC,id DESC').bind(projectId),env.DB.prepare('SELECT id,request_id,name,content_type,size,sha256,created_at FROM project_submission_attachments WHERE project_id=? ORDER BY created_at,id').bind(projectId),env.DB.prepare('SELECT * FROM project_submission_records WHERE project_id=? ORDER BY created_at DESC,id DESC').bind(projectId),env.DB.prepare('SELECT * FROM project_submission_evidence WHERE project_id=? ORDER BY created_at,id').bind(projectId)]);const byRequest=new Map();for(const file of files.results){const list=byRequest.get(file.request_id)||[];list.push({id:file.id,name:file.name,contentType:file.content_type,size:file.size,sha256:file.sha256,createdAt:file.created_at});byRequest.set(file.request_id,list);}return Response.json({requests:requests.results.map(row=>({...requestView(row),files:byRequest.get(row.id)||[]})),results:results.results.map(resultView),submissions:formatSubmissionRecords(submissions.results,evidence.results)});}
 if(!['POST','PATCH'].includes(request.method))return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return bad();}const now=new Date().toISOString();
 if(kind==='requests'&&!itemId&&request.method==='POST'){
  const due=input?.dueDate??'',note=input?.note??'',createTask=input?.createTask??false;
  if(!['observation','correction'].includes(input?.kind)||!text(input?.title,300)||!input.title.trim()||!validDate(due)||!text(note,20000)||typeof createTask!=='boolean')return bad();
  const key=request.headers.get('idempotency-key');if(key!==null&&!/^[A-Za-z0-9._:-]{1,128}$/.test(key))return bad();
  const payloadHash=await hash([input.kind,input.title.trim(),due,note.trim(),createTask]),id=crypto.randomUUID(),taskId=createTask?crypto.randomUUID():'';const statements=[];
  if(createTask)statements.push(env.DB.prepare('INSERT INTO project_tasks (id,project_id,title,due_date,completed,version,created_at,updated_at) SELECT ?,?,?,?,0,1,?,? WHERE ? IS NULL OR NOT EXISTS(SELECT 1 FROM project_submission_requests WHERE project_id=? AND client_key=?)').bind(taskId,projectId,input.title.trim(),due,now,now,key,projectId,key));
  statements.push(env.DB.prepare('INSERT INTO project_submission_requests(id,project_id,kind,title,due_date,note,status,task_id,version,created_at,updated_at,client_key,payload_hash) SELECT ?,?,?,?,?,?,\'pending\',?,1,?,?,?,? WHERE ? IS NULL OR NOT EXISTS(SELECT 1 FROM project_submission_requests WHERE project_id=? AND client_key=?)').bind(id,projectId,input.kind,input.title.trim(),due,note.trim(),taskId,now,now,key,payloadHash,key,projectId,key));
  await env.DB.batch(statements);const row=key===null?await env.DB.prepare(`${requestsSql} AND r.id=?`).bind(projectId,id).first():await env.DB.prepare(`${requestsSql} AND r.client_key=?`).bind(projectId,key).first();if(row.payload_hash!==payloadHash)return conflict();return Response.json({item:requestView(row)},{status:row.id===id?201:200});
 }
 if(kind==='requests'&&itemId&&request.method==='PATCH'){
  if(!['pending','reviewed','resolved'].includes(input?.status)||!Number.isSafeInteger(input?.version)||input.version<1)return bad();
  const row=await env.DB.prepare('UPDATE project_submission_requests SET status=?,version=version+1,updated_at=? WHERE project_id=? AND id=? AND version=? RETURNING id').bind(input.status,now,projectId,itemId,input.version).first();
  if(!row){const exists=await env.DB.prepare('SELECT id FROM project_submission_requests WHERE project_id=? AND id=?').bind(projectId,itemId).first();return exists?conflict():missing();}
  return Response.json({item:requestView(await env.DB.prepare(`${requestsSql} AND r.id=?`).bind(projectId,itemId).first())});
 }
 if(kind==='results'&&!itemId&&request.method==='POST'){
  const note=input?.note??'';if(!['awarded','not_awarded','other'].includes(input?.result)||!text(note,20000))return bad();
  const key=request.headers.get('idempotency-key');if(key!==null&&!/^[A-Za-z0-9._:-]{1,128}$/.test(key))return bad();const payloadHash=await hash([input.result,note.trim()]),id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO project_submission_results(id,project_id,result,note,created_at,client_key,payload_hash) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(id,projectId,input.result,note.trim(),now,key,payloadHash).run();
  const row=key===null?await env.DB.prepare('SELECT * FROM project_submission_results WHERE project_id=? AND id=?').bind(projectId,id).first():await env.DB.prepare('SELECT * FROM project_submission_results WHERE project_id=? AND client_key=?').bind(projectId,key).first();if(row.payload_hash!==payloadHash)return conflict();return Response.json({item:resultView(row)},{status:row.id===id?201:200});
 }
 return new Response('Method not allowed',{status:405});
}
