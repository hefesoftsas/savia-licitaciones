import {digest} from './runners.js';
import {prepareReviewTransport,openReviewSource,ReviewSnapshotError} from './project-review-transport.js';

// Private component transport; it is not yet part of the project snapshot.
export async function runnerReviewCapture(request,env,runner,projectId,jobId){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{
  if(jobId){const params=new URL(request.url).searchParams;const body=await openReviewSource(env,runner.ownerId,projectId,jobId,params.get('etag'),params.get('version'));return body?new Response(body,{headers:{'content-type':'application/octet-stream','x-content-type-options':'nosniff'}}):Response.json({error:'not_found'},{status:404});}
  const snapshot=await prepareReviewTransport(env,runner.ownerId,projectId);if(!snapshot)return Response.json({error:'not_found'},{status:404});
  await snapshot.assertUnchanged();return Response.json({revision:await digest(JSON.stringify(snapshot.revisionData)),tasks:snapshot.tasks});
 }catch(error){if(error instanceof ReviewSnapshotError)return Response.json({error:'source_unavailable'},{status:409});throw error;}
}
