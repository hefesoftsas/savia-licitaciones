import {cleanupDesktopUploads,uploadLeaseMs} from './desktop-file-cleanup.js';
import {readBlindStagedArtifact,discardBlindStagedArtifact} from './desktop-blind-large.js';

const bad=()=>Response.json({error:'invalid_blind_task'},{status:400});
const missing=()=>Response.json({error:'not_found'},{status:404});
const conflict=()=>Response.json({error:'source_conflict'},{status:409});
const removed=()=>Response.json({error:'blind_task_removed'},{status:410});
const encoder=new TextEncoder();
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value)),b=>b.toString(16).padStart(2,'0')).join('');
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9._:-]{1,110}$/.test(x);
const stamp=x=>typeof x==='string'&&x.length>0&&x.length<=100&&!/[\x00-\x1f\x7f]/.test(x);
const maxSize=25*1024*1024;

export async function importDesktopBlindTask(request,env,runner,requestId,sourceKey){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)||!/^[a-f0-9]{64}$/.test(sourceKey))return bad();
 const project=await env.DB.prepare('SELECT p.id FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=?').bind(runner.ownerId,requestId).first();
 if(!project)return missing();
 let form,input;try{form=await request.formData();input=JSON.parse(form.get('metadata'));}catch{return bad();}
 if(!record(input)||!id(input.id)||await hash(input.id)!==sourceKey||!['blind-check.inspect','blind-check.fix','blind-check.fix-report','blind-check.fix-ai'].includes(input.kind)||!['succeeded','failed','interrupted'].includes(input.state)||!record(input.payload)||!Array.isArray(input.payload.fileIds)||!input.payload.fileIds.length||input.payload.fileIds.length>50||input.payload.fileIds.some(value=>!id(value))||new Set(input.payload.fileIds).size!==input.payload.fileIds.length||!stamp(input.createdAt)||!stamp(input.updatedAt)||(input.result!==null&&!record(input.result))||(input.parentExpected!==undefined&&typeof input.parentExpected!=='boolean'))return bad();
 if(input.kind!=='blind-check.inspect'&&!id(input.payload.inspectionJobId))return bad();
 const succeeded=input.state==='succeeded',hasReport=succeeded&&['blind-check.fix-report','blind-check.fix-ai'].includes(input.kind)&&input.payload.reportVersion===1;
 const large=succeeded&&input.kind!=='blind-check.inspect'&&Number.isSafeInteger(input.artifact?.size)&&input.artifact.size>maxSize&&input.artifact.size<=1024*1024*1024;
 if(large?(typeof form.get('stagedArtifact')!=='string'||form.get('artifact')!==null):(form.get('stagedArtifact')!==null))return bad();
 const readFile=async(kind,required)=>{
  const meta=input[kind],file=form.get(kind);
  if(kind==='artifact'&&large){if(!record(meta)||!/^[a-f0-9]{64}$/.test(meta.sha256||''))throw Error();return {large:true};}
  if(!required){if(meta!==null||file!==null)throw Error();return null;}
  if(!record(meta)||!Number.isSafeInteger(meta.size)||meta.size<1||meta.size>maxSize||!/^[a-f0-9]{64}$/.test(meta.sha256||'')||!file||typeof file.arrayBuffer!=='function'||file.size!==meta.size)throw Error();
  const bytes=new Uint8Array(await file.arrayBuffer());if(await hash(bytes)!==meta.sha256)throw Error();return bytes;
 };
 let artifact,report;try{artifact=await readFile('artifact',succeeded);report=await readFile('report',hasReport);}catch{return bad();}
 const contentHash=await hash(JSON.stringify(input));
 const lookup=()=>env.DB.prepare('SELECT i.job_id,i.content_hash,a.deleted_at FROM desktop_blind_task_imports i LEFT JOIN job_artifacts a ON a.job_id=i.job_id WHERE i.owner_id=? AND i.request_id=? AND i.source_key=?').bind(runner.ownerId,requestId,sourceKey).first();
 const prior=row=>row.content_hash!==contentHash?conflict():row.deleted_at?removed():Response.json({jobId:row.job_id});
 const existing=await lookup();if(existing){if(large)await discardBlindStagedArtifact(env,runner.ownerId,requestId,sourceKey,form.get('stagedArtifact'),input.artifact).catch(()=>{});return prior(existing);}
 const largeStage=large?await readBlindStagedArtifact(env,runner.ownerId,requestId,sourceKey,form.get('stagedArtifact'),input.artifact):null;if(large&&(!largeStage||largeStage.projectId!==project.id))return bad();
 const mapFile=async original=>{
  const row=await env.DB.prepare('SELECT f.id FROM desktop_plan_file_imports i JOIN project_files f ON f.id=i.file_id AND f.project_id=i.project_id WHERE i.owner_id=? AND i.request_id=? AND i.project_id=? AND i.source_key=?').bind(runner.ownerId,requestId,project.id,await hash(original)).first();
  return row?.id||`missing:${await hash(original)}`;
 };
 const fileMap=new Map();for(const fileId of input.payload.fileIds)fileMap.set(fileId,await mapFile(fileId));
 const payload={...input.payload,fileIds:input.payload.fileIds.map(fileId=>fileMap.get(fileId)),imported:true};
 for(const field of ['bidFileId','tenderFileId'])if(payload[field]!==undefined){if(!fileMap.has(payload[field]))return bad();payload[field]=fileMap.get(payload[field]);}
 let parentId;
 if(input.kind!=='blind-check.inspect'){
  if(input.parentExpected===true){const parent=await env.DB.prepare("SELECT i.job_id FROM desktop_blind_task_imports i JOIN jobs j ON j.id=i.job_id AND j.owner_id=i.owner_id AND j.project_id=i.project_id WHERE i.owner_id=? AND i.request_id=? AND i.project_id=? AND i.source_key=? AND j.kind='blind-check.inspect'").bind(runner.ownerId,requestId,project.id,await hash(input.payload.inspectionJobId)).first();if(!parent)return conflict();parentId=parent.job_id;}
  else parentId=`missing:${await hash(input.payload.inspectionJobId)}`;
  payload.inspectionJobId=parentId;
 }
 if(succeeded&&input.kind==='blind-check.inspect'){
  let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(artifact));}catch{return bad();}
  if(!record(parsed)||!record(parsed.sourceFile)||parsed.sourceFile.id!==(input.payload.bidFileId||input.payload.fileIds[0])||typeof parsed.sourceFile.name!=='string'||!Array.isArray(parsed.groups)||!record(parsed.summary))return bad();
  parsed.sourceFile.id=fileMap.get(parsed.sourceFile.id);artifact=encoder.encode(JSON.stringify(parsed));if(artifact.length>maxSize)return bad();
 }else if(succeeded&&!large&&(artifact.length<4||artifact[0]!==0x50||artifact[1]!==0x4b||artifact[2]!==3||artifact[3]!==4))return bad();
 if(report){let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(report));}catch{return bad();}if(!record(parsed)||!record(parsed.after)||!Array.isArray(parsed.after.groups))return bad();}
 const jobId=crypto.randomUUID(),artifactId=artifact?crypto.randomUUID():null,reportId=report?crypto.randomUUID():null,mutation=crypto.randomUUID(),now=new Date().toISOString();
 const result=input.result?{...input.result}:null;if(result){delete result.artifactId;delete result.reportId;if(artifactId)result.artifactId=artifactId;if(reportId)result.reportId=reportId;if(input.kind!=='blind-check.inspect')result.inspectionJobId=parentId;}
 const staged=large?[{kind:'artifact',stage:largeStage.id,key:largeStage.objectKey,size:input.artifact.size,sha256:input.artifact.sha256}]:[];
 try{
  for(const [kind,bytes] of [['artifact',large?null:artifact],['report',report]])if(bytes){const stage=crypto.randomUUID(),key=`desktop-blind/${project.id}/${crypto.randomUUID()}`;staged.push({kind,stage,key,bytes});await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(stage,runner.ownerId,key,Date.now()+uploadLeaseMs,now).run();await env.FILES.put(key,bytes);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(stage,runner.ownerId).run();}
  const own='EXISTS (SELECT 1 FROM desktop_blind_task_imports WHERE owner_id=? AND request_id=? AND source_key=? AND mutation_id=?)',params=[runner.ownerId,requestId,sourceKey,mutation];
  const stageGuards=staged.map(()=>"EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND writer_done=1 AND lease_until>?)");
  const guardArgs=staged.flatMap(item=>[item.stage,runner.ownerId,Date.now()]);
  const statements=[env.DB.prepare(`INSERT INTO desktop_blind_task_imports(owner_id,request_id,source_key,project_id,job_id,content_hash,mutation_id,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM desktop_plan_imports i JOIN projects p ON p.id=i.project_id AND p.owner_id=i.owner_id WHERE i.owner_id=? AND i.request_id=? AND p.id=?)${stageGuards.map(guard=>` AND ${guard}`).join('')} ON CONFLICT(owner_id,request_id,source_key) DO NOTHING`).bind(runner.ownerId,requestId,sourceKey,project.id,jobId,contentHash,mutation,now,runner.ownerId,requestId,project.id,...guardArgs),
   env.DB.prepare(`INSERT INTO jobs(id,project_id,owner_id,kind,client_request_id,payload_json,state,created_at,updated_at,result_json) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${own}`).bind(jobId,project.id,runner.ownerId,input.kind,`blind-import-${sourceKey}`,JSON.stringify(payload),input.state,input.createdAt,input.updatedAt,result?JSON.stringify(result):null,...params)];
  for(const item of staged){const table=item.kind==='artifact'?'job_artifacts':'job_repair_reports',itemId=item.kind==='artifact'?artifactId:reportId;statements.push(env.DB.prepare(`INSERT INTO ${table}(id,job_id,object_key,sha256,size,created_at) SELECT ?,?,?,?,?,? WHERE ${own}`).bind(itemId,jobId,item.key,item.sha256||await hash(item.bytes),item.size??item.bytes.length,now,...params));}
  const outcome=await env.DB.batch(statements);if(outcome[0].meta.changes)return Response.json({jobId},{status:201});
 }finally{for(const item of staged)try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(item.stage,runner.ownerId).run();}catch{/* Retry later. */}try{await cleanupDesktopUploads(env,runner.ownerId);}catch{/* Retry later. */}}
 const winner=await lookup();return winner?prior(winner):conflict();
}
