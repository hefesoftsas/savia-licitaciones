const missing=()=>Response.json({error:'not_found'},{status:404});
export async function moveOfferPackageItem(request,env,owner,projectId,itemId){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_input'},{status:400});}
 if(typeof input?.neighborId!=='string'||!input.neighborId||input.neighborId.length>128||input.neighborId===itemId||!Number.isSafeInteger(input.from)||input.from<0||!Number.isSafeInteger(input.to)||input.to<0||input.from===input.to)return Response.json({error:'invalid_input'},{status:400});
 const [first,second,last]=await env.DB.batch([
  env.DB.prepare('UPDATE project_offer_package_items SET sort_order=-1 WHERE id=? AND project_id=? AND sort_order=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND owner_id=?) AND EXISTS(SELECT 1 FROM project_offer_package_items WHERE id=? AND project_id=? AND sort_order=?) AND NOT EXISTS(SELECT 1 FROM project_offer_package_items WHERE project_id=? AND sort_order=-1) AND NOT EXISTS(SELECT 1 FROM project_offer_package_items WHERE project_id=? AND sort_order>MIN(?,?) AND sort_order<MAX(?,?))').bind(itemId,projectId,input.from,projectId,owner,input.neighborId,projectId,input.to,projectId,projectId,input.from,input.to,input.from,input.to),
  env.DB.prepare('UPDATE project_offer_package_items SET sort_order=? WHERE id=? AND project_id=? AND sort_order=? AND changes()=1 AND EXISTS(SELECT 1 FROM project_offer_package_items WHERE id=? AND project_id=? AND sort_order=-1)').bind(input.from,input.neighborId,projectId,input.to,itemId,projectId),
  env.DB.prepare('UPDATE project_offer_package_items SET sort_order=? WHERE id=? AND project_id=? AND sort_order=-1 AND changes()=1 AND EXISTS(SELECT 1 FROM project_offer_package_items WHERE id=? AND project_id=? AND sort_order=?)').bind(input.to,itemId,projectId,input.neighborId,projectId,input.from),
 ]);
 if(first.meta.changes&&second.meta.changes&&last.meta.changes)return Response.json({moved:true});
 const current=await env.DB.prepare('SELECT x.id FROM project_offer_package_items x JOIN projects p ON p.id=x.project_id WHERE x.id=? AND x.project_id=? AND p.owner_id=?').bind(itemId,projectId,owner).first();return current?Response.json({error:'source_changed'},{status:409}):missing();
}
