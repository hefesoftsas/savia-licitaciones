import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('la plantilla compila localmente con los bindings requeridos',async()=>{
 const config=JSON.parse(await readFile(join(root,'wrangler.web.template.jsonc'),'utf8'));
 assert.deepEqual(Object.keys(config).sort(), ['$schema','assets','compatibility_date','compatibility_flags','d1_databases','durable_objects','migrations','keep_vars','main','name','r2_buckets','send_email','vars','workers_dev'].sort());
 assert.equal(config.workers_dev,false);
 assert.equal(config.assets.binding,'ASSETS');
 assert.deepEqual(config.assets.run_worker_first,['/api','/api/*']);
 assert.equal(config.vars.AUTH_REQUIRE_VERIFIED_EMAIL,'true');
 assert.equal(config.d1_databases[0].binding,'DB');
 assert.equal(config.r2_buckets[0].binding,'FILES');
 assert.equal(config.send_email[0].name,'EMAIL');
 assert.deepEqual(config.durable_objects.bindings,[{name:'PREVIEW_WAKE',class_name:'PreviewWake'},{name:'BACKUP_GATE',class_name:'BackupGate'}]);
 assert.deepEqual(config.migrations,[{tag:'preview-wake-v1',new_sqlite_classes:['PreviewWake']},{tag:'backup-gate-v1',new_sqlite_classes:['BackupGate']}]);
 assert.equal(config.vars.BACKUP_GATE_ENABLED,'true');
 assert.equal(config.ai,undefined);
 for(const name of ['BETTER_AUTH_SECRET','CREDENTIAL_KEY_HEX','CREDENTIAL_PREVIOUS_KEYS_JSON','BACKUP_CONTROL_TOKEN'])assert.equal(config.vars[name],undefined);
 const output=await mkdtemp(join(tmpdir(),'savia-web-template-'));
 try{
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--config','wrangler.web.template.jsonc','--outdir',output],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'},timeout:30000});
  assert.ok((await readFile(join(output,'index.js'),'utf8')).length>0);
 }finally{await rm(output,{recursive:true,force:true});}
});
