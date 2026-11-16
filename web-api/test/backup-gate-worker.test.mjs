import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('the real Worker blocks the API and unlocks through a Durable Object',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'savia-backup-gate-'));let mf;
  try{
    execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--config','wrangler.web.template.jsonc','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
    mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'gate-test'},r2Buckets:['FILES'],durableObjects:{BACKUP_GATE:'BackupGate',PREVIEW_WAKE:'PreviewWake'},bindings:{BACKUP_GATE_ENABLED:'true',BACKUP_CONTROL_TOKEN:'secret',BETTER_AUTH_SECRET:'0123456789abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'}}));
    const db=await mf.getD1Database('DB');
    for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())
      for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
    const control=action=>mf.dispatchFetch('http://localhost/api/_backup/'+action,{method:'POST',headers:{authorization:'Bearer secret','content-type':'application/json'},body:JSON.stringify({nonce:'test'})});
    assert.equal((await control('lock')).status,200);
    assert.equal((await(await control('status')).json()).active,0);
    assert.equal((await mf.dispatchFetch('http://localhost/api/me')).status,503);
    assert.equal((await control('unlock')).status,200);
    assert.equal((await mf.dispatchFetch('http://localhost/api/me')).status,401);
  }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});

test('the real Durable Object drains an in-flight handler before reporting zero',async()=>{
  const source=await readFile(join(root,'src/backup-gate.js'),'utf8');
  const script=source+`\nexport default {async fetch(request,env){return withBackupGate(request,env,async()=>{await new Promise(r=>setTimeout(r,500));return new Response('done');});}};`;
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-30',durableObjects:{BACKUP_GATE:'BackupGate'},bindings:{BACKUP_GATE_ENABLED:'true',BACKUP_CONTROL_TOKEN:'secret'}}));
  try{
    const control=action=>mf.dispatchFetch('http://localhost/api/_backup/'+action,{method:'POST',headers:{authorization:'Bearer secret','content-type':'application/json'},body:JSON.stringify({nonce:'test'})});
    const pending=mf.dispatchFetch('http://localhost/api/work');
    let active=0;for(let n=0;n<100&&!active;n++){active=(await(await control('status')).json()).active;if(!active)await new Promise(r=>setTimeout(r,5));}
    assert.equal(active,1);
    assert.equal((await(await control('lock')).json()).active,1);
    assert.equal((await mf.dispatchFetch('http://localhost/api/other')).status,503);
    assert.equal((await pending).status,200);
    assert.equal((await(await control('status')).json()).active,0);
    assert.equal((await control('unlock')).status,200);
  }finally{await mf.dispose();}
});
