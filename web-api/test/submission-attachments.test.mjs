import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {File} from 'node:buffer';
import {uploadSubmissionAttachment} from '../../client/src/features/web/submission-attachments.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('adjuntos de solicitudes se guardan, verifican, aíslan y limpian',{timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-submission-files-'));let worker;
 try{execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'submission-files'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),post=(path,body,cookie)=>req(path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  async function user(name){const response=await post('/api/auth/sign-up/email',{name,email:`${name}@example.test`,password:'password-123456'});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}
  const alice=await user('alice'),bob=await user('bob'),project=(await(await post('/api/projects',{title:'Proyecto'},alice)).json()).project,base=`/api/projects/${project.id}/submission-tracking`,created=await post(`${base}/requests`,{kind:'observation',title:'Aclaración'},alice),item=(await created.json()).item,path=`${base}/requests/${item.id}/files`;
  const upload=(cookie,body='evidencia',key='upload-one',origin='http://localhost')=>req(path,{method:'POST',headers:{origin,cookie,'content-type':'application/pdf','x-file-name':encodeURIComponent('adjunto ñ.pdf'),'x-savia-size':String(Buffer.byteLength(body)),'idempotency-key':key},body});
  assert.equal((await upload(bob)).status,404);assert.equal((await upload(alice,'evidencia','upload-one','https://otro.example')).status,403);
  const sized=(size,body)=>req(path,{method:'POST',headers:{origin:'http://localhost',cookie:alice,'content-type':'application/pdf','x-file-name':'archivo.pdf','x-savia-size':size,'idempotency-key':'size-check'},body});assert.equal((await sized('268435457','x')).status,413);assert.equal((await sized('3','x')).status,400);assert.equal((await sized('0','xy')).status,400);
  const first=await upload(alice);assert.equal(first.status,201,await first.clone().text());const file=(await first.json()).file;assert.equal(file.name,'adjunto ñ.pdf');assert.equal(file.sha256,createHash('sha256').update('evidencia').digest('hex'));
  const replay=await upload(alice);assert.equal(replay.status,200);assert.equal((await replay.json()).file.id,file.id);assert.equal((await upload(alice,'otro')).status,409);
  const state=await(await req(base,{headers:{cookie:alice}})).json();assert.deepEqual(state.requests[0].files.map(x=>x.id),[file.id]);assert.equal((await req(`${path}/${file.id}`,{headers:{cookie:bob}})).status,404);const download=await req(`${path}/${file.id}`,{headers:{cookie:alice}});assert.equal(download.status,200);assert.equal(await download.text(),'evidencia');
  const row=await DB.prepare('SELECT object_key FROM project_submission_attachments WHERE id=?').bind(file.id).first();await FILES.put(row.object_key,'modificado');assert.equal((await req(`${path}/${file.id}`,{headers:{cookie:alice}})).status,409);assert.equal((await upload(alice)).status,409);await FILES.put(row.object_key,'evidencia');
  await DB.prepare("CREATE TRIGGER fail_attachment BEFORE INSERT ON project_submission_attachments BEGIN SELECT RAISE(ABORT, 'test'); END").run();assert.equal((await upload(alice,'fallo','upload-fail')).status,500);await DB.prepare('DROP TRIGGER fail_attachment').run();assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM project_submission_attachments').first()).n,1);assert.equal((await FILES.list({prefix:`submission/${project.id}/`})).objects.length,1);
  const empty=await upload(alice,'','empty');assert.equal(empty.status,201,await empty.clone().text());const emptyFile=(await empty.json()).file;assert.equal(emptyFile.size,0);assert.equal(await(await req(`${path}/${emptyFile.id}`,{headers:{cookie:alice}})).text(),'');
  const concurrent=await Promise.all([upload(alice,'otro archivo','concurrent'),upload(alice,'otro archivo','concurrent')]);assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,201]);const copies=await Promise.all(concurrent.map(x=>x.json()));assert.equal(copies[0].file.id,copies[1].file.id);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM project_submission_attachments').first()).n,3);
  const browserFile=new File(['desde la web'],'soporte.txt',{type:'text/plain'}),browserSend=async(url,options)=>{const response=await req(url,{...options,headers:{...options.headers,origin:'http://localhost',cookie:alice},body:await options.body.arrayBuffer()});assert.equal(response.status,201);return response.json();};const webUpload=await uploadSubmissionAttachment({projectId:project.id,requestId:item.id,file:browserFile,key:'browser-file',send:browserSend});assert.equal(webUpload.file.name,'soporte.txt');assert.equal(await(await req(`${path}/${webUpload.file.id}`,{headers:{cookie:alice}})).text(),'desde la web');
  assert.equal((await req(`/api/projects/${project.id}`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}})).status,204);assert.equal(await FILES.get(row.object_key),null);
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
