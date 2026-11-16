import {digest} from './runners.js';
const bad=()=>Response.json({error:'invalid_input'},{status:400});
const text=(x,max,required=false)=>typeof x==='string'&&x.length<=max&&(!required||!!x.trim());
const stamp=x=>text(x,100,true)&&!/[\x00-\x1f\x7f]/.test(x);
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(`${x}T00:00:00Z`))&&new Date(`${x}T00:00:00Z`).toISOString().slice(0,10)===x;
export async function importSubmissionTrackingItem(request,env,runner,requestId,kind,sourceHash){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!['requests','results'].includes(kind)||!/^[a-f0-9]{64}$/.test(sourceHash))return bad();
 let item;try{item=await request.json();}catch{return bad();}
 if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||!/^[A-Za-z0-9._:-]{1,100}$/.test(item.id)||await digest(item.id)!==sourceHash||!stamp(item.createdAt))return bad();
 let input;
 if(kind==='requests'){
  if(!['observation','correction'].includes(item.kind)||!text(item.title,300,true)||!(item.dueDate===''||date(item.dueDate))||!text(item.note,20000)||!['pending','reviewed','resolved'].includes(item.status)||!text(item.taskId,256)||!Number.isSafeInteger(item.version)||item.version<1||!stamp(item.updatedAt))return bad();
  const {id,kind,title,dueDate,note,status,taskId,version,createdAt,updatedAt}=item;input={id,kind,title,dueDate,note,status,taskId,version,createdAt,updatedAt};
 }else{if(!['awarded','not_awarded','other'].includes(item.result)||!text(item.note,20000))return bad();const {id,result,note,createdAt}=item;input={id,result,note,createdAt};}
 const project=await env.DB.prepare('SELECT p.id FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=?').bind(runner.ownerId,requestId).first();if(!project)return Response.json({error:'not_found'},{status:404});
 const contentHash=await digest(JSON.stringify(input)),newId=crypto.randomUUID(),mutation=crypto.randomUUID(),now=new Date().toISOString();
 const mapped=kind==='requests'&&input.taskId?await env.DB.prepare('SELECT t.id FROM desktop_task_id_map m JOIN project_tasks t ON t.id=m.task_id AND t.project_id=m.project_id WHERE m.owner_id=? AND m.request_id=? AND m.project_id=? AND m.source_id=?').bind(runner.ownerId,requestId,project.id,input.taskId).first():null;
 const taskId=kind==='requests'&&input.taskId?(mapped?.id||`unresolved:${await digest(input.taskId)}`):'';
 const guard='EXISTS(SELECT 1 FROM desktop_submission_tracking_imports WHERE owner_id=? AND request_id=? AND kind=? AND source_hash=? AND mutation_id=?)';
 const statement=kind==='requests'?env.DB.prepare(`INSERT INTO project_submission_requests(id,project_id,kind,title,due_date,note,status,task_id,version,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(newId,project.id,input.kind,input.title,input.dueDate,input.note,input.status,taskId,input.version,input.createdAt,input.updatedAt,runner.ownerId,requestId,kind,sourceHash,mutation):env.DB.prepare(`INSERT INTO project_submission_results(id,project_id,result,note,created_at) SELECT ?,?,?,?,? WHERE ${guard}`).bind(newId,project.id,input.result,input.note,input.createdAt,runner.ownerId,requestId,kind,sourceHash,mutation);
 const result=await env.DB.batch([env.DB.prepare('INSERT INTO desktop_submission_tracking_imports(owner_id,request_id,project_id,kind,source_hash,content_hash,item_id,source_task_id,mutation_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,request_id,kind,source_hash) DO NOTHING').bind(runner.ownerId,requestId,project.id,kind,sourceHash,contentHash,newId,input.taskId||'',mutation,now),statement]);
 if(result[0].meta.changes)return Response.json({id:newId},{status:201});
 const previous=await env.DB.prepare('SELECT content_hash,item_id FROM desktop_submission_tracking_imports WHERE owner_id=? AND request_id=? AND kind=? AND source_hash=?').bind(runner.ownerId,requestId,kind,sourceHash).first();if(previous?.content_hash!==contentHash)return Response.json({error:'import_conflict'},{status:409});
 const table=kind==='requests'?'project_submission_requests':'project_submission_results';const exists=await env.DB.prepare(`SELECT id FROM ${table} WHERE project_id=? AND id=?`).bind(project.id,previous.item_id).first();return exists?Response.json({id:previous.item_id}):Response.json({error:'item_removed'},{status:410});
}
