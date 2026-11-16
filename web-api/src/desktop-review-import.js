import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';
import {remapReviewPayload,remapReviewResult,remapReviewReport} from '../../runner/project-review-remap.mjs';

const bad=()=>Response.json({error:'invalid_review_task'},{status:400}),missing=()=>Response.json({error:'not_found'},{status:404}),conflict=()=>Response.json({error:'source_conflict'},{status:409});
const encoder=new TextEncoder(),record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),id=x=>typeof x==='string'&&/^[A-Za-z0-9._:-]{1,110}$/.test(x),stamp=x=>typeof x==='string'&&x.length>0&&x.length<=100&&!/[\x00-\x1f\x7f]/.test(x);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value)),b=>b.toString(16).padStart(2,'0')).join('');
const sections={rejection:'rejectionCheckResult',typo:'typoCheckResult',logic:'logicCheckResult'};

export async function importDesktopReviewTask(request,env,runner,requestId,sourceKey){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(sourceKey))return bad();
 const project=await env.DB.prepare('SELECT p.id FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=?').bind(runner.ownerId,requestId).first();if(!project)return missing();
 let form,input;try{form=await request.formData();const metadata=form.get('metadata');if(typeof metadata!=='string'||metadata.length>5000000)return bad();input=JSON.parse(metadata);}catch{return bad();}
 if(!record(input)||!id(input.id)||await hash(input.id)!==sourceKey||!['duplicate-check.analyze','rejection-check.analyze','rejection-check.extract'].includes(input.kind)||!['succeeded','failed','interrupted'].includes(input.state)||!record(input.payload)||!Array.isArray(input.payload.fileIds)||!input.payload.fileIds.length||input.payload.fileIds.length>50||input.payload.fileIds.some(value=>!id(value))||new Set(input.payload.fileIds).size!==input.payload.fileIds.length||!stamp(input.createdAt)||!stamp(input.updatedAt)||(input.result!==null&&!record(input.result))||!Array.isArray(input.removals)||input.removals.length>10000)return bad();
 for(const key of ['tenderFileIds','bidFileIds'])if(input.payload[key]!==undefined&&(!Array.isArray(input.payload[key])||input.payload[key].some(value=>!input.payload.fileIds.includes(value))))return bad();
 const needsArtifact=input.state==='succeeded'&&input.kind!=='rejection-check.extract';
 if(input.state==='succeeded'&&input.kind==='rejection-check.extract'&&(typeof input.result?.criteria!=='string'||input.result.criteria.length>200000))return bad();
 if((input.kind!=='rejection-check.analyze'||!needsArtifact)&&input.removals.length)return bad();
 let bytes=null,parsed=null;const file=form.get('artifact');
 if(needsArtifact){
  if(!record(input.artifact)||!Number.isSafeInteger(input.artifact.size)||input.artifact.size<1||input.artifact.size>25*1024*1024||!/^[a-f0-9]{64}$/.test(input.artifact.sha256||'')||!file||typeof file.arrayBuffer!=='function'||file.size!==input.artifact.size)return bad();
  bytes=new Uint8Array(await file.arrayBuffer());if(await hash(bytes)!==input.artifact.sha256)return bad();
  try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return bad();}
  if(!record(parsed)||typeof parsed.status!=='string'||!Array.isArray(parsed.sourceFiles))return bad();
 }else if(input.artifact!==null||file!==null)return bad();
 const seen=new Set();for(const item of input.removals){
  if(!record(item)||!Object.hasOwn(sections,item.section)||typeof item.findingId!=='string'||!item.findingId||item.findingId.length>256||!stamp(item.createdAt))return bad();
  const key=JSON.stringify([item.section,item.findingId]);if(seen.has(key))return bad();seen.add(key);
  const findings=parsed?.[sections[item.section]]?.findings;if(!Array.isArray(findings)||findings.filter(finding=>finding?.id===item.findingId).length!==1)return bad();
 }
 const contentHash=await hash(JSON.stringify(input));
 const lookup=()=>env.DB.prepare('SELECT i.job_id,i.content_hash,a.deleted_at FROM desktop_review_task_imports i LEFT JOIN job_artifacts a ON a.job_id=i.job_id WHERE i.owner_id=? AND i.request_id=? AND i.source_key=?').bind(runner.ownerId,requestId,sourceKey).first();
 const prior=row=>row.content_hash!==contentHash?conflict():row.deleted_at?Response.json({error:'review_removed'},{status:410}):Response.json({jobId:row.job_id});
 const existing=await lookup();if(existing)return prior(existing);
 const mapping=new Map();for(const original of input.payload.fileIds){const row=await env.DB.prepare('SELECT f.id FROM desktop_plan_file_imports i JOIN project_files f ON f.id=i.file_id AND f.project_id=i.project_id WHERE i.owner_id=? AND i.request_id=? AND i.project_id=? AND i.source_key=?').bind(runner.ownerId,requestId,project.id,await hash(original)).first();mapping.set(original,row?.id||`missing:${await hash(original)}`);}
 const payload={...remapReviewPayload(input.payload,mapping),imported:true};
 if(parsed){bytes=encoder.encode(JSON.stringify(remapReviewReport(input.kind,parsed,mapping)));if(bytes.length>25*1024*1024)return bad();}
 const jobId=crypto.randomUUID(),artifactId=bytes?crypto.randomUUID():null,mutation=crypto.randomUUID(),now=new Date().toISOString(),result=remapReviewResult(input.result,mapping,artifactId);
 let stage=null,key=null;
 try{
  if(bytes){stage=crypto.randomUUID();key=`desktop-review/${project.id}/${crypto.randomUUID()}`;await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(stage,runner.ownerId,key,Date.now()+uploadLeaseMs,now).run();await env.FILES.put(key,bytes);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(stage,runner.ownerId).run();}
  const own='EXISTS (SELECT 1 FROM desktop_review_task_imports WHERE owner_id=? AND request_id=? AND source_key=? AND mutation_id=?)',params=[runner.ownerId,requestId,sourceKey,mutation];
  const guard=stage?" AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND writer_done=1 AND lease_until>?)":'',guardArgs=stage?[stage,runner.ownerId,Date.now()]:[];
  const statements=[env.DB.prepare(`INSERT INTO desktop_review_task_imports(owner_id,request_id,source_key,project_id,job_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=? AND p.id=?)${guard} ON CONFLICT(owner_id,request_id,source_key) DO NOTHING`).bind(runner.ownerId,requestId,sourceKey,project.id,jobId,contentHash,mutation,now,runner.ownerId,requestId,project.id,...guardArgs),
   env.DB.prepare(`INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at,result_json) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${own}`).bind(jobId,project.id,runner.ownerId,input.kind,`review-import-${sourceKey}`,JSON.stringify(payload),input.state,input.createdAt,input.updatedAt,result?JSON.stringify(result):null,...params)];
  if(bytes)statements.push(env.DB.prepare(`INSERT INTO job_artifacts(id,job_id,object_key,sha256,size,created_at) SELECT ?,?,?,?,?,? WHERE ${own}`).bind(artifactId,jobId,key,await hash(bytes),bytes.length,now,...params));
  if(input.removals.length)statements.push(env.DB.prepare(`INSERT INTO rejection_finding_removals(job_id,owner_id,section,finding_id,created_at) SELECT ?,?,json_extract(value,'$.section'),json_extract(value,'$.findingId'),json_extract(value,'$.createdAt') FROM json_each(?) WHERE ${own}`).bind(jobId,runner.ownerId,JSON.stringify(input.removals),...params));
  const outcome=await env.DB.batch(statements);if(outcome[0].meta.changes)return Response.json({jobId},{status:201});
 }finally{if(stage)try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(stage,runner.ownerId).run();await cleanupDesktopUploads(env,runner.ownerId);}catch{/* Retry later. */}}
 const winner=await lookup();return winner?prior(winner):conflict();
}
