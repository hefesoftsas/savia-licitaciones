const initial={criteria:'',custom:'',options:{rejectionCheck:true,typoCheck:true,logicCheck:true},version:0,updatedAt:null};
const view=row=>({criteria:row.criteria,custom:row.custom,options:JSON.parse(row.options_json),version:row.version,updatedAt:row.updated_at});
export async function rejectionDraft(request,env,owner,projectId){
 const project=await env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(projectId,owner).first();
 if(!project)return Response.json({error:'not_found'},{status:404});
 if(request.method==='GET'){
  const row=await env.DB.prepare('SELECT * FROM rejection_drafts WHERE project_id=?').bind(projectId).first();return Response.json(row?view(row):initial);
 }
 if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_input'},{status:400});}
 const valid=typeof input?.criteria==='string'&&input.criteria.length<=200000&&typeof input.custom==='string'&&input.custom.length<=20000&&Number.isSafeInteger(input.version)&&input.version>=0&&input.options&&['rejectionCheck','typoCheck','logicCheck'].every(key=>typeof input.options[key]==='boolean');
 if(!valid)return Response.json({error:'invalid_input'},{status:400});
 const options=JSON.stringify({rejectionCheck:input.options.rejectionCheck,typoCheck:input.options.typoCheck,logicCheck:input.options.logicCheck}),now=new Date().toISOString();
 const row=input.version===0?await env.DB.prepare('INSERT INTO rejection_drafts (project_id,criteria,custom,options_json,version,updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(project_id) DO NOTHING RETURNING *').bind(projectId,input.criteria,input.custom,options,now).first():await env.DB.prepare('UPDATE rejection_drafts SET criteria=?,custom=?,options_json=?,version=version+1,updated_at=? WHERE project_id=? AND version=? RETURNING *').bind(input.criteria,input.custom,options,now,projectId,input.version).first();
 return row?Response.json(view(row)):Response.json({error:'version_conflict'},{status:409});
}
