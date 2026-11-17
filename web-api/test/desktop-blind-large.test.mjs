import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),hash=data=>createHash('sha256').update(data).digest('hex');
test('restaura una copia anónima grande con staging aislado y recibo idempotente',{timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-blind-large-'));let worker;
 try{execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'blind-large'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');for(const f of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',f),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  const token='a'.repeat(64),other='b'.repeat(64);for(const [id,t] of [['alice',token],['bob',other]]){await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind(id,id,`${id}@example.com`).run();await DB.prepare('INSERT INTO runners(id,owner_id,name,token_hash,created_at) VALUES(?,?,?,?,?)').bind(id,id,id,hash(t),'2026').run();}
  await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();await DB.prepare('INSERT INTO desktop_plan_imports VALUES(?,?,?,?,?,?)').bind('alice','req','hash','p','mutation','2026').run();
  const bytes=Buffer.alloc(25*1024*1024+1,0x61);Buffer.from([0x50,0x4b,3,4]).copy(bytes);const sourceKey=hash('fix'),base=`http://localhost/api/runner/imports/technical-plan/req/blind-tasks/${sourceKey}`,large=`${base}/large-artifact`,headers={authorization:`Bearer ${token}`},meta={size:bytes.length,sha256:hash(bytes)};
  const post=(url,body,h=headers)=>worker.dispatchFetch(url,{method:'POST',headers:{...h,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post(`${large}/start`,meta,{})).status,401);assert.equal((await post(`${large}/start`,meta,{authorization:`Bearer ${other}`})).status,404);
  const incorrect=await(await post(`${large}/start`,{...meta,sha256:'f'.repeat(64)})).json(),badParts=[];for(let offset=0,n=1;offset<bytes.length;offset+=incorrect.partSize,n++){const part=await worker.dispatchFetch(`${large}/part/${n}`,{method:'POST',headers:{...headers,'x-savia-multipart':incorrect.handle},body:bytes.subarray(offset,offset+incorrect.partSize)});badParts.push(await part.json());}assert.equal((await post(`${large}/complete`,{handle:incorrect.handle,parts:badParts})).status,400);assert.equal((await FILES.list({prefix:'desktop-blind/p/'})).objects.length,0);
  const start=await post(`${large}/start`,meta);assert.equal(start.status,200,await start.clone().text());const {handle,partSize}=await start.json();const parts=[];
  assert.equal((await worker.dispatchFetch(`${large}/part/1`,{method:'POST',headers:{...headers,'x-savia-multipart':`${handle}x`},body:'x'})).status,400);
  for(let offset=0,n=1;offset<bytes.length;offset+=partSize,n++){const part=await worker.dispatchFetch(`${large}/part/${n}`,{method:'POST',headers:{...headers,'x-savia-multipart':handle},body:bytes.subarray(offset,offset+partSize)});assert.equal(part.status,200);parts.push(await part.json());}
  const completed=await post(`${large}/complete`,{handle,parts});assert.equal(completed.status,200,await completed.clone().text());const {stagedToken}=await completed.json();
  const task={id:'fix',kind:'blind-check.fix',state:'succeeded',payload:{fileIds:['source'],inspectionJobId:'old'},result:{},createdAt:'2026',updatedAt:'2026',artifact:meta,report:null,parentExpected:false};
  const submit=async()=>{const form=new FormData();form.set('metadata',JSON.stringify(task));form.set('stagedArtifact',stagedToken);const request=new Request(base,{method:'POST',headers,body:form});return worker.dispatchFetch(base,{method:'POST',headers:Object.fromEntries(request.headers),body:await request.arrayBuffer()});};
  const first=await submit();assert.equal(first.status,201,await first.clone().text());const jobId=(await first.json()).jobId;assert.equal((await(await submit()).json()).jobId,jobId);const row=await DB.prepare('SELECT object_key,sha256,size FROM job_artifacts WHERE job_id=?').bind(jobId).first();assert.equal(row.sha256,meta.sha256);assert.equal((await FILES.head(row.object_key)).size,bytes.length);await DB.prepare("UPDATE job_artifacts SET deleted_at='2026' WHERE job_id=?").bind(jobId).run();assert.equal((await submit()).status,410);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
