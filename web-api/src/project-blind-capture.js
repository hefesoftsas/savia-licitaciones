import {digest} from './runners.js';
import {prepareBlindTransport,openBlindSource,BlindSnapshotError} from './project-blind-transport.js';

// An internal component transport; the regular project snapshot is still partial.
export async function runnerBlindCapture(request,env,runner,projectId,jobId,kind){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{
  if(jobId){
   const params=new URL(request.url).searchParams;
   const body=await openBlindSource(env,runner.ownerId,projectId,jobId,kind,params.get('etag'),params.get('version'));
   return body?new Response(body,{headers:{'content-type':'application/octet-stream','x-content-type-options':'nosniff'}}):Response.json({error:'not_found'},{status:404});
  }
  const snapshot=await prepareBlindTransport(env,runner.ownerId,projectId);
  if(!snapshot)return Response.json({error:'not_found'},{status:404});
  await snapshot.assertUnchanged();
  return Response.json({revision:await digest(JSON.stringify(snapshot.revisionData)),tasks:snapshot.tasks});
 }catch(error){if(error instanceof BlindSnapshotError)return Response.json({error:'source_unavailable'},{status:409});throw error;}
}
