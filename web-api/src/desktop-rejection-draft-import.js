import {digest} from './runners.js';
import {validProjectRejectionDraft} from '../../runner/project-rejection-draft-restore.mjs';

export async function importDesktopRejectionDraft(request,env,runner,requestId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_draft'},{status:400});}
 if(input===null||!validProjectRejectionDraft(input))return Response.json({error:'invalid_draft'},{status:400});
 const project=await env.DB.prepare('SELECT i.project_id FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=?').bind(runner.ownerId,requestId).first();
 if(!project)return Response.json({error:'not_found'},{status:404});
 const contentHash=await digest(JSON.stringify(input)),mutation=crypto.randomUUID(),now=new Date().toISOString();
 const options=JSON.stringify({rejectionCheck:input.options.rejectionCheck,typoCheck:input.options.typoCheck,logicCheck:input.options.logicCheck});
 const result=await env.DB.batch([
  env.DB.prepare('INSERT INTO desktop_rejection_draft_imports(owner_id,request_id,project_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM rejection_drafts WHERE project_id=?) ON CONFLICT(owner_id,request_id) DO NOTHING').bind(runner.ownerId,requestId,project.project_id,contentHash,mutation,now,project.project_id),
  env.DB.prepare('INSERT INTO rejection_drafts(project_id,criteria,custom,options_json,version,updated_at) SELECT ?,?,?,?,1,? WHERE EXISTS (SELECT 1 FROM desktop_rejection_draft_imports WHERE owner_id=? AND request_id=? AND mutation_id=?)').bind(project.project_id,input.criteria,input.custom,options,input.updatedAt,runner.ownerId,requestId,mutation),
 ]);
 if(result[0].meta.changes)return Response.json({imported:true},{status:201});
 const previous=await env.DB.prepare('SELECT content_hash FROM desktop_rejection_draft_imports WHERE owner_id=? AND request_id=?').bind(runner.ownerId,requestId).first();
 return previous?.content_hash===contentHash?Response.json({imported:true}):Response.json({error:'draft_conflict'},{status:409});
}
