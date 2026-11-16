import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('conserva el borrador por proyecto y evita sobrescribir otra sesión',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-rejection-draft-'));let worker;
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'draft-test'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
  const db=await worker.getD1Database('DB');for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),write=(path,method,body,cookie,origin='http://localhost')=>req(path,{method,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  async function signup(name){const r=await write('/api/auth/sign-up/email','POST',{name,email:`${name}@example.com`,password:'password-123456'});return r.headers.get('set-cookie').split(';')[0];}
  const alice=await signup('alice'),bob=await signup('bob'),project=(await (await write('/api/projects','POST',{title:'Proyecto'},alice)).json()).project,base=`/api/projects/${project.id}/rejection-draft`,options={rejectionCheck:true,typoCheck:false,logicCheck:true},draft={criteria:'Criterios ñ',custom:'Comprueba garantías',options,version:0};
  assert.equal((await req(base)).status,401);assert.equal((await req(base,{headers:{cookie:bob}})).status,404);assert.equal((await write(base,'PUT',draft,bob)).status,404);assert.equal((await write(base,'PUT',draft,alice,'https://other.example')).status,403);
  const initial=await (await req(base,{headers:{cookie:alice}})).json();assert.equal(initial.version,0);assert.equal(initial.criteria,'');
  assert.equal((await write(base,'PUT',{...draft,options:{...options,logicCheck:'true'}},alice)).status,400);
  const saved=await write(base,'PUT',draft,alice);assert.equal(saved.status,200);assert.equal((await saved.json()).version,1);
  const attempts=await Promise.all([write(base,'PUT',{...draft,criteria:'Edición A',version:1},alice),write(base,'PUT',{...draft,criteria:'Edición B',version:1},alice)]);assert.deepEqual(attempts.map(x=>x.status).sort(),[200,409]);
  const stored=await (await req(base,{headers:{cookie:alice}})).json();assert.equal(stored.version,2);assert.ok(['Edición A','Edición B'].includes(stored.criteria));assert.equal(stored.custom,draft.custom);assert.deepEqual(stored.options,options);assert.equal((await req(base,{headers:{cookie:alice}})).headers.get('cache-control'),'no-store');
 }finally{await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
