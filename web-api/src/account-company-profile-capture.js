import {digest} from './runners.js';
import {prepareCompanyProfileTransport,openCompanyProfileImage,CompanyProfileSnapshotError} from './account-company-profile-transport.js';

// Partial account component transport, scoped to the authenticated runner owner.
export async function runnerCompanyProfileCapture(request,env,runner,imageId){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 try{
  if(imageId){const params=new URL(request.url).searchParams,body=await openCompanyProfileImage(env,runner.ownerId,imageId,params.get('etag'),params.get('version'));return body?new Response(body,{headers:{'content-type':'application/octet-stream','x-content-type-options':'nosniff'}}):Response.json({error:'not_found'},{status:404});}
  const snapshot=await prepareCompanyProfileTransport(env,runner.ownerId);if(!snapshot)return Response.json({error:'not_found'},{status:404});
  await snapshot.assertUnchanged();return Response.json({revision:await digest(JSON.stringify(snapshot.revisionData)),profile:snapshot.profile,images:snapshot.images});
 }catch(error){if(error instanceof CompanyProfileSnapshotError)return Response.json({error:'source_unavailable'},{status:409});throw error;}
}
