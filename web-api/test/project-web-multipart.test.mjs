import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('carga multipart autenticada, reintentos y aislamiento de cuenta',{timeout:90000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-web-multipart-'));let worker;
 try{execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'web-multipart'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost',CREDENTIAL_KEY_HEX:'11'.repeat(32),CREDENTIAL_KEY_ID:'fixture'}}));
  const DB=await worker.getD1Database('DB'),FILES=await worker.getR2Bucket('FILES');for(const f of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',f),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  const req=(path,opts={})=>worker.dispatchFetch(`http://localhost${path}`,opts),post=(path,body,cookie)=>req(path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  const signup=async name=>(await post('/api/auth/sign-up/email',{name,email:`${name}@example.com`,password:'test-password-12345'})).headers.get('set-cookie').split(';')[0];
  const alice=await signup('alice'),bob=await signup('bob'),project=(await(await post('/api/projects',{title:'Proyecto'},alice)).json()).project.id,base=`/api/projects/${project}/files/multipart`,size=50*1024*1024+1,meta={name:'grande.pdf',contentType:'application/pdf',size,requestKey:'upload-1'};
  assert.equal((await post(`${base}/start`,{...meta,contentType:'text/plain\ninvalid'},alice)).status,400);
  assert.equal((await post(`${base}/start`,meta)).status,401);assert.equal((await post(`${base}/start`,meta,bob)).status,404);
  const initial=await(await post(`${base}/start`,{...meta,requestKey:'abort-test'},alice)).json();
  assert.equal((await req(`${base}/part/1`,{method:'POST',headers:{cookie:alice,origin:'http://localhost','x-savia-multipart':`${initial.handle}x`},body:'x'})).status,400);
  assert.equal((await req(`${base}/part/1`,{method:'POST',headers:{cookie:alice,origin:'https://other.example','x-savia-multipart':initial.handle},body:'x'})).status,403);
  assert.equal((await post(`${base}/abort`,{handle:initial.handle},alice)).status,200);assert.equal((await req(`${base}/part/1`,{method:'POST',headers:{cookie:alice,origin:'http://localhost','x-savia-multipart':initial.handle},body:'x'})).status,409);
  const sendParts=async(data,metadata=meta)=>{const start=await post(`${base}/start`,metadata,alice);assert.equal(start.status,200,await start.clone().text());const {handle,partSize}=await start.json();assert.equal(partSize,10*1024*1024);
   assert.equal((await req(`${base}/part/1`,{method:'POST',headers:{cookie:bob,origin:'http://localhost','x-savia-multipart':handle},body:data.subarray(0,partSize)})).status,404);
   const parts=[];for(let offset=0,n=1;offset<data.length;offset+=partSize,n++){const part=await req(`${base}/part/${n}`,{method:'POST',headers:{cookie:alice,origin:'http://localhost','x-savia-multipart':handle},body:data.subarray(offset,offset+partSize)});assert.equal(part.status,200);parts.push(await part.json());}return post(`${base}/complete`,{handle,parts},alice);};
  const data=Buffer.alloc(size,0x61),first=await sendParts(data);assert.equal(first.status,201,await first.clone().text());const file=(await first.json()).file;assert.equal(file.size,size);const again=await sendParts(data);assert.equal(again.status,200);assert.equal((await again.json()).file.id,file.id);
  data[0]=0x62;assert.equal((await sendParts(data)).status,409);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM project_files WHERE project_id=?').bind(project).first()).n,1);const row=await DB.prepare('SELECT object_key FROM project_files WHERE id=?').bind(file.id).first();assert.equal((await FILES.head(row.object_key)).size,size);
  assert.equal((await req(`/api/projects/${project}/files/${file.id}`,{method:'DELETE',headers:{cookie:alice,origin:'http://localhost'}})).status,204);data[0]=0x61;assert.equal((await sendParts(data)).status,410);
  const {uploadLargeProjectFile}=await import('../../client/src/features/web/project-multipart-upload.mjs'),{request}=await import('../../client/src/features/web/api.mjs');
  const browserRequest=(path,options)=>request(path,options,async(url,init)=>{const headers=new Headers(init.headers);headers.set('cookie',alice);headers.set('origin','http://localhost');const body=init.body instanceof Blob?await init.body.arrayBuffer():init.body;return req(url,{method:init.method,headers:Object.fromEntries(headers),body});});
  Buffer.from('%PDF-').copy(data,0);
  const browserResult=await uploadLargeProjectFile({projectId:project,file:new File([data],'browser.pdf',{type:'application/pdf'}),key:'browser-upload',request:browserRequest});assert.equal(browserResult.file.size,size);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM project_files WHERE project_id=?').bind(project).first()).n,1);
  const pairing=await(await post('/api/runner-pairings',{},alice)).json(),runner=await(await post('/api/runners/pair',{code:pairing.code,name:'Equipo'})).json();
  const credential=await(await post('/api/provider-credentials',{provider:'opencode-go',model:'fixture',secret:'fixture-key'},alice)).json();
  const queued=await req(`/api/projects/${project}/jobs`,{method:'POST',headers:{cookie:alice,origin:'http://localhost','content-type':'application/json','idempotency-key':'stream-test'},body:JSON.stringify({kind:'tender-chat.send',payload:{question:'¿Qué dice?',fileIds:[browserResult.file.id],dataProcessingConsent:true},credentialId:credential.credential.id})});assert.equal(queued.status,201,await queued.clone().text());
  const runnerModule=name=>process.env.SAVIA_TEST_PACKAGED_RUNNER?pathToFileURL(join(process.env.SAVIA_TEST_PACKAGED_RUNNER,'runner',name)).href:new URL(`../../runner/${name}`,import.meta.url).href;const {runOnce}=await import(runnerModule('work-loop.mjs')),{extractTenderSources}=await import(runnerModule('tender-chat.mjs')),{stat}=await import('node:fs/promises');let parsedSize;
  const result=await runOnce({server:(await worker.ready).origin,token:runner.token,handlers:{'tender-chat.send':async(payload,context)=>{const [source]=await extractTenderSources(payload.fileIds,context,{}, {},dir,false,{parse:async(_app,path)=>{parsedSize=(await stat(path)).size;return 'Texto';}});assert.equal(source.content,'Texto');return {answer:'Texto'};}}});assert.equal(result.state,'succeeded');assert.equal(parsedSize,size);


 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
