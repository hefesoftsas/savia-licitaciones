import {digest} from './runners.js';
class SnapshotError extends Error {}
const fail=()=>{throw new SnapshotError('El RUP cambió o no está disponible.');};
async function read(env,owner){
 const [current,facts]=await env.DB.batch([
  env.DB.prepare('SELECT c.certificate_id,c.version,p.id,p.name,p.object_key,p.pages,p.imported_at,p.issued_on FROM rup_current c LEFT JOIN rup_certificates p ON p.id=c.certificate_id AND p.owner_id=c.owner_id WHERE c.owner_id=?').bind(owner),
  env.DB.prepare('SELECT f.id,f.label,f.value,f.page,f.version,f.created_at,f.updated_at FROM rup_reviewed_facts f JOIN rup_current c ON c.certificate_id=f.certificate_id JOIN rup_certificates p ON p.id=c.certificate_id AND p.owner_id=c.owner_id WHERE c.owner_id=? ORDER BY f.created_at,f.id').bind(owner),
 ]);const row=current.results[0]||null;if(row?.certificate_id&&!row.id)fail();if(facts.results.length>500)fail();return {current:row,facts:facts.results};
}
const revision=(rows,etag)=>digest(JSON.stringify({rows,etag}));
export async function runnerRupCapture(request,env,runner,pdf){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{
  const rows=await read(env,runner.ownerId),row=rows.current;
  if(!row?.id){if(pdf)return Response.json({error:'not_found'},{status:404});return Response.json({revision:await revision(rows,null),certificate:null});}
  const object=await env.FILES.head(row.object_key);if(!object||!Number.isSafeInteger(object.size)||object.size<1||object.size>25*1024*1024)fail();
  const version=await revision(rows,object.etag);
  if(pdf){const params=new URL(request.url).searchParams;if(params.get('etag')!==object.etag||params.get('version')!==version)fail();const content=await env.FILES.get(row.object_key,{onlyIf:{etagMatches:object.etag}});if(!content?.body||content.etag!==object.etag||content.size!==object.size)fail();return new Response(content.body,{headers:{'content-type':'application/pdf','x-content-type-options':'nosniff'}});}
  if(JSON.stringify(await read(env,runner.ownerId))!==JSON.stringify(rows))fail();const check=await env.FILES.head(row.object_key);if(!check||check.etag!==object.etag||check.size!==object.size)fail();
  return Response.json({revision:version,certificate:{id:row.id,name:row.name,pages:row.pages,importedAt:row.imported_at,issuedOn:row.issued_on,size:object.size,etag:object.etag,facts:rows.facts.map(({id,label,value,page})=>({id,label,value,page}))}});
 }catch(error){if(error instanceof SnapshotError)return Response.json({error:'source_unavailable'},{status:409});throw error;}
}
