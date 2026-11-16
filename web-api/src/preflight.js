import checklist from './preflight-checklist.cjs';
import economicOffer from '../../client/electron/services/economicOfferService.cjs';

export async function preflight(request,env,owner,projectId){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const [project,secop,baseline,imported,requirements,supports,certificates,offer,tasks]=await env.DB.batch([
  env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(projectId,owner),
  env.DB.prepare('SELECT process_json FROM project_secop WHERE project_id=? AND owner_id=?').bind(projectId,owner),
  env.DB.prepare('SELECT process_json FROM secop_watch_baselines_web WHERE project_id=? AND owner_id=?').bind(projectId,owner),
  env.DB.prepare('SELECT record_json FROM desktop_saved_tender_imports WHERE project_id=? AND owner_id=?').bind(projectId,owner),
  env.DB.prepare('SELECT r.id,r.title,r.status FROM project_requirements r JOIN projects p ON p.id=r.project_id WHERE p.id=? AND p.owner_id=? ORDER BY r.created_at,r.id').bind(projectId,owner),
  env.DB.prepare("SELECT s.id,s.requirement_id,s.title,s.status,s.link_type,s.link_id,CASE WHEN s.link_type='certificate' THEN EXISTS(SELECT 1 FROM company_certificates c WHERE c.id=s.link_id AND c.owner_id=p.owner_id AND c.deleting=0) WHEN s.link_type='rup' THEN EXISTS(SELECT 1 FROM rup_current r JOIN rup_certificates c ON c.id=r.certificate_id AND c.owner_id=r.owner_id WHERE r.owner_id=p.owner_id AND c.id=s.link_id) ELSE 0 END AS available FROM project_requirement_supports s JOIN projects p ON p.id=s.project_id WHERE p.id=? AND p.owner_id=? ORDER BY s.created_at,s.id").bind(projectId,owner),
  env.DB.prepare('SELECT id,validity_mode,valid_from,valid_to FROM company_certificates WHERE owner_id=? AND deleting=0').bind(owner),
  env.DB.prepare('SELECT d.draft_json FROM economic_offer_drafts d JOIN projects p ON p.id=d.project_id WHERE p.id=? AND p.owner_id=?').bind(projectId,owner),
  env.DB.prepare('SELECT t.title,t.completed,t.due_date FROM project_tasks t JOIN projects p ON p.id=t.project_id WHERE p.id=? AND p.owner_id=? ORDER BY t.created_at,t.id').bind(projectId,owner),
 ]);
 if(!project.results.length)return Response.json({error:'not_found'},{status:404});
 let process={},observed=null,calculation=null,draft=null,error='';
 try{
  if(secop.results[0])process=JSON.parse(secop.results[0].process_json);
  else if(imported.results[0])process=JSON.parse(imported.results[0].record_json).process||{};
  if(baseline.results[0])observed=JSON.parse(baseline.results[0].process_json);
  if(offer.results[0]){draft=JSON.parse(offer.results[0].draft_json);try{calculation=economicOffer.calculateOffer(draft);}catch{error='invalid';}}
 }catch{return Response.json({error:'stored_data_invalid'},{status:503});}
 if(observed?.deadlineVerified===true&&observed.deadline)process={...process,deadline:observed.deadline,deadlineVerified:true};
 const input={tender:{process},requirements:requirements.results,supports:supports.results.map(s=>({id:s.id,requirementId:s.requirement_id,title:s.title,status:s.status,certificateId:s.link_type==='none'?'':s.link_id,certificateAvailable:!!s.available})),certificates:certificates.results.map(c=>({certificateId:c.id,validityMode:c.validity_mode,validFrom:c.valid_from,validTo:c.valid_to})),offer:draft?{draft,calculation,error}:null,tasks:tasks.results.map(t=>({title:t.title,completed:!!t.completed,dueDate:t.due_date}))};
 return Response.json(checklist.buildPreflightChecklist(input));
}
