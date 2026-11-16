import { digest } from './runners.js';
import { cleanupDesktopUploads, uploadLeaseMs } from './desktop-file-cleanup.js';

const maxFile = 50 * 1024 * 1024, maxTotal = 100 * 1024 * 1024;
const types = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const bad = () => Response.json({ error: 'invalid_part' }, { status: 400 });
const conflict = () => Response.json({ error: 'lease_conflict' }, { status: 409 });
const activeSql = "EXISTS (SELECT 1 FROM jobs WHERE id=? AND owner_id=? AND runner_id=? AND lease_hash=? AND state='running' AND lease_expires_at>? AND kind='secop.import-zip')";
function valid(bytes, extension) {
 const signature = extension === 'pdf' ? [0x25,0x50,0x44,0x46,0x2d] : ['docx','xlsx'].includes(extension) ? [0x50,0x4b,0x03,0x04] : [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
 return signature.every((value,index) => bytes[index] === value);
}
export async function uploadSecopZipPart(request, env, runner, jobId, indexText) {
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const lease=request.headers.get('x-savia-lease')||'',index=Number(indexText);let name;
 try{name=decodeURIComponent(request.headers.get('x-savia-name')||'');}catch{return bad();}
 const extension=name.split('.').at(-1)?.toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(lease)||!/^(0|[1-9]\d*)$/.test(indexText)||!Number.isSafeInteger(index)||index>49||!name||name.length>140||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||!types[extension])return bad();
 const hash=await digest(lease),args=[jobId,runner.ownerId,runner.id,hash,Date.now()];
 if(!await env.DB.prepare(`SELECT 1 AS ok WHERE ${activeSql}`).bind(...args).first())return conflict();
 if(Number(request.headers.get('content-length'))>maxFile)return Response.json({error:'file_too_large'},{status:413});
 if(!request.body)return bad();
 const chunks=[];let size=0;
 for await(const chunk of request.body){size+=chunk.byteLength;if(size>maxFile)return Response.json({error:'file_too_large'},{status:413});chunks.push(chunk);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 if(!valid(bytes,extension))return bad();
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 const lookup=()=>env.DB.prepare("SELECT p.name,p.sha256,p.size FROM secop_zip_parts p JOIN desktop_file_staging s ON s.id=p.staging_id WHERE p.job_id=? AND p.part_index=? AND s.owner_id=? AND s.state='writing' AND s.lease_until>?").bind(jobId,index,runner.ownerId,Date.now()).first();
 const previous=await lookup();if(previous)return previous.name===name&&previous.sha256===sha&&previous.size===size?Response.json({ok:true}):conflict();
 // Expired staging cannot be published. Detach it so a retry can use the
 // same index, while the existing cleanup mechanism reclaims its object.
 const stale=await env.DB.batch([
  env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE owner_id=? AND state='writing' AND lease_until<=? AND id=(SELECT staging_id FROM secop_zip_parts WHERE job_id=? AND part_index=?)").bind(runner.ownerId,Date.now(),jobId,index),
  env.DB.prepare("DELETE FROM secop_zip_parts WHERE job_id=? AND part_index=? AND staging_id IN (SELECT id FROM desktop_file_staging WHERE owner_id=? AND (state!='writing' OR lease_until<=?))").bind(jobId,index,runner.ownerId,Date.now()),
 ]);
 if(stale[1].meta.changes)await cleanupDesktopUploads(env,runner.ownerId);
 const id=crypto.randomUUID(),key=`secop-zip/${jobId}/${id}`,now=Date.now();let retained=false;
 await env.DB.prepare("INSERT INTO desktop_file_staging(id,owner_id,object_key,state,lease_until,created_at) VALUES(?,?,?,'writing',?,?)").bind(id,runner.ownerId,key,now+uploadLeaseMs,now).run();
 try{
  await env.FILES.put(key,bytes);await env.DB.prepare('UPDATE desktop_file_staging SET writer_done=1 WHERE id=? AND owner_id=?').bind(id,runner.ownerId).run();
  const inserted=await env.DB.prepare(`INSERT INTO secop_zip_parts(job_id,part_index,staging_id,name,content_type,size,sha256) SELECT ?,?,?,?,?,?,? WHERE ${activeSql} AND EXISTS (SELECT 1 FROM desktop_file_staging WHERE id=? AND owner_id=? AND state='writing' AND lease_until>?) AND (SELECT COALESCE(SUM(size),0) FROM secop_zip_parts WHERE job_id=?)+?<=? ON CONFLICT(job_id,part_index) DO NOTHING RETURNING job_id`).bind(jobId,index,id,name,types[extension],size,sha,jobId,runner.ownerId,runner.id,hash,Date.now(),id,runner.ownerId,Date.now(),jobId,size,maxTotal).first();
  if(inserted){retained=true;return Response.json({ok:true},{status:201});}
  if(!await env.DB.prepare(`SELECT 1 AS ok WHERE ${activeSql}`).bind(jobId,runner.ownerId,runner.id,hash,Date.now()).first())return conflict();
  const other=await lookup();return other&&other.name===name&&other.sha256===sha&&other.size===size?Response.json({ok:true}):conflict();
 }finally{if(!retained){try{await env.DB.prepare("UPDATE desktop_file_staging SET state='cleanup',lease_until=0 WHERE id=? AND owner_id=? AND state IN ('writing','watching')").bind(id,runner.ownerId).run();await cleanupDesktopUploads(env,runner.ownerId);}catch{/* staging remains for cleanup */}}}
}

export async function commitSecopZipParts(request, env, runner, jobId) {
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 let input;try{input=await request.json();}catch{return bad();}
 const {lease,count,skipped}=input||{};
 if(typeof lease!=='string'||!/^[a-f0-9]{64}$/.test(lease)||!Number.isSafeInteger(count)||count<1||count>50||!Number.isSafeInteger(skipped)||skipped<0||skipped>500)return bad();
 const hash=await digest(lease),mutation=crypto.randomUUID(),now=Date.now(),date=new Date(now).toISOString(),result=JSON.stringify({imported:count,skipped});
 const owned='EXISTS (SELECT 1 FROM secop_zip_commits WHERE job_id=? AND owner_id=? AND mutation_id=?)';
 const batch=await env.DB.batch([
  env.DB.prepare(`INSERT INTO secop_zip_commits(job_id,project_id,document_id,owner_id,part_count,skipped,mutation_id)
   SELECT j.id,j.project_id,json_extract(j.payload_json,'$.documentId'),j.owner_id,?,?,? FROM jobs j
   WHERE j.id=? AND j.owner_id=? AND j.runner_id=? AND j.lease_hash=? AND j.state='running' AND j.lease_expires_at>? AND j.kind='secop.import-zip'
   AND json_type(j.payload_json,'$.documentId')='text' AND json_extract(j.payload_json,'$.documentId') NOT GLOB '*[^0-9]*' AND length(json_extract(j.payload_json,'$.documentId'))>0
   AND EXISTS (SELECT 1 FROM project_secop s WHERE s.project_id=j.project_id AND s.owner_id=j.owner_id AND s.source='secop-ii' AND json_extract(s.process_json,'$.portfolioId')=json_extract(j.payload_json,'$.portfolioId'))
   AND NOT EXISTS (SELECT 1 FROM project_secop_files f WHERE f.project_id=j.project_id AND f.document_id=json_extract(j.payload_json,'$.documentId'))
   AND NOT EXISTS (SELECT 1 FROM secop_zip_files f WHERE f.project_id=j.project_id AND f.document_id=json_extract(j.payload_json,'$.documentId'))
   AND (SELECT COUNT(*) FROM secop_zip_parts p JOIN desktop_file_staging s ON s.id=p.staging_id WHERE p.job_id=j.id AND s.owner_id=j.owner_id AND s.state='writing' AND s.lease_until>? AND p.part_index>=0 AND p.part_index<?)=?
   AND (SELECT COUNT(*) FROM secop_zip_parts p WHERE p.job_id=j.id)=?
   ON CONFLICT(job_id) DO NOTHING`).bind(count,skipped,mutation,jobId,runner.ownerId,runner.id,hash,now,now,count,count,count),
  env.DB.prepare(`INSERT INTO project_files(id,project_id,name,content_type,object_key,size,created_at) SELECT p.staging_id,c.project_id,p.name,p.content_type,s.object_key,p.size,? FROM secop_zip_parts p JOIN desktop_file_staging s ON s.id=p.staging_id JOIN secop_zip_commits c ON c.job_id=p.job_id WHERE p.job_id=? AND ${owned}`).bind(date,jobId,jobId,runner.ownerId,mutation),
  env.DB.prepare(`INSERT INTO secop_zip_files(project_id,document_id,file_id) SELECT c.project_id,c.document_id,p.staging_id FROM secop_zip_parts p JOIN secop_zip_commits c ON c.job_id=p.job_id WHERE p.job_id=? AND ${owned}`).bind(jobId,jobId,runner.ownerId,mutation),
  env.DB.prepare(`DELETE FROM desktop_file_staging WHERE id IN (SELECT staging_id FROM secop_zip_parts WHERE job_id=?) AND ${owned}`).bind(jobId,jobId,runner.ownerId,mutation),
  env.DB.prepare(`UPDATE jobs SET state='succeeded',result_json=?,updated_at=? WHERE id=? AND owner_id=? AND runner_id=? AND lease_hash=? AND ${owned}`).bind(result,date,jobId,runner.ownerId,runner.id,hash,jobId,runner.ownerId,mutation),
 ]);
 if(batch[0].meta.changes)return Response.json({imported:count,skipped});
 const prior=await env.DB.prepare("SELECT c.part_count,c.skipped FROM secop_zip_commits c JOIN jobs j ON j.id=c.job_id WHERE c.job_id=? AND c.owner_id=? AND j.runner_id=? AND j.lease_hash=? AND j.state='succeeded'").bind(jobId,runner.ownerId,runner.id,hash).first();
 return prior?.part_count===count&&prior.skipped===skipped?Response.json({imported:count,skipped}):conflict();
}
