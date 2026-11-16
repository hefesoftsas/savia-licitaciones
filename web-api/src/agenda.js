import agenda from '../../client/electron/services/secopAgendaService.cjs';

export async function loadAgenda(env, ownerId) {
 const [projects, tasks, certificates, baselines, requests] = await Promise.all([
  env.DB.prepare('SELECT p.id, p.title, s.process_json FROM projects p LEFT JOIN project_secop s ON s.project_id = p.id AND s.owner_id = p.owner_id WHERE p.owner_id = ?').bind(ownerId).all(),
  env.DB.prepare('SELECT t.id, t.project_id, t.title, t.due_date, t.completed FROM project_tasks t JOIN projects p ON p.id = t.project_id WHERE p.owner_id = ?').bind(ownerId).all(),
  env.DB.prepare('SELECT id AS certificateId, name, validity_mode AS validityMode, valid_to AS validTo FROM company_certificates WHERE owner_id = ? AND deleting = 0').bind(ownerId).all(),
  env.DB.prepare('SELECT project_id, process_json, checked_at, error FROM secop_watch_baselines_web WHERE owner_id = ?').bind(ownerId).all(),
  env.DB.prepare("SELECT r.id,r.project_id,r.title,r.due_date FROM project_submission_requests r JOIN projects p ON p.id=r.project_id WHERE p.owner_id=? AND r.status<>'resolved' AND r.due_date<>''").bind(ownerId).all(),
 ]);
 const tenders = projects.results.map(row => ({ id: row.id, process: row.process_json ? JSON.parse(row.process_json) : { title: row.title } }));
 const work = tasks.results.map(row => ({ id: row.id, processId: row.project_id, title: row.title, dueDate: row.due_date, completed: !!row.completed }));
 const watchBaselines=baselines.results.map(row=>{const data=JSON.parse(row.process_json);return {processId:row.project_id,deadline:data.deadline||'',deadlineVerified:data.deadlineVerified===true,checkedAt:row.checked_at,error:row.error};});
 const titles=new Map(tenders.map(item=>[item.id,item.process.title||item.id]));
 const submissionRequests=requests.results.map(row=>({id:`request:${row.id}`,kind:'request',title:row.title,date:row.due_date,processId:row.project_id,processTitle:titles.get(row.project_id)}));
 return [...agenda.buildAgenda({ tenders, tasks: work, certificates: certificates.results, watchBaselines }),...submissionRequests].sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title,'es'));
}
export async function userAgenda(request, env, ownerId) {
 if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
 return Response.json({items:await loadAgenda(env,ownerId)});
}
