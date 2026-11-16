#!/usr/bin/env node
// Restore only to explicitly named, previously created, empty QA resources.
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {restoreSnapshot} from './cloud_restore.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),web=join(root,'web-api');
const [configPath,snapshotDir,targetDb,targetBucket]=process.argv.slice(2);
if(!configPath||!snapshotDir||!targetDb||!targetBucket)throw Error('Uso: node infra/web/qa_restore.mjs CONFIG_QA DIRECTORIO_RESPALDO D1_VACÍA R2_VACÍO');
const config=JSON.parse(await readFile(resolve(configPath),'utf8')),manifest=JSON.parse(await readFile(join(resolve(snapshotDir),'manifest.json'),'utf8'));
const complete=JSON.parse(await readFile(join(resolve(snapshotDir),'complete.json'),'utf8'));
const manifestHash=createHash('sha256').update(await readFile(join(resolve(snapshotDir),'manifest.json'))).digest('hex');
if(complete.version!==1||complete.manifestSha256!==manifestHash)throw Error('El respaldo está incompleto o el manifiesto cambió.');
if(config.name!=='savia-web-runner-qa'||manifest.bucket!=='savia-web-runner-qa-backup'||!/^savia-web-runner-qa-restore-[a-z0-9-]+$/.test(targetDb)||!/^savia-web-runner-qa-restore-[a-z0-9-]+$/.test(targetBucket))throw Error('Este comando solo admite los recursos aislados de restauración QA.');
const sourceSql=join(resolve(snapshotDir),'d1-restore.sql'),worker=`savia-qa-restore-${randomUUID().slice(0,8)}`,secret=randomBytes(32).toString('hex'),helperUrl=`https://${worker}.jose-douglas-dev.workers.dev`,dir=await mkdtemp(join(process.env.HOME,'.savia/cloudflare-qa/restore-helper-')),helperConfig=join(dir,'worker.json');
const cfg={name:worker,account_id:config.account_id,main:join(root,'infra/web/r2_copy_worker.mjs'),compatibility_date:'2026-10-30',compatibility_flags:['nodejs_compat'],workers_dev:true,r2_buckets:[{binding:'SOURCE',bucket_name:manifest.bucket},{binding:'TARGET',bucket_name:targetBucket}],vars:{SOURCE_PREFIX:manifest.prefix,TARGET_PREFIX:''}};
await writeFile(helperConfig,JSON.stringify(cfg,null,2),{mode:0o600});
function wrangler(args,input,output=false){try{return execFileSync('pnpm',['exec','wrangler',...args],{cwd:web,stdio:['pipe',output?'pipe':'ignore','pipe'],input,timeout:300000,encoding:'utf8'});}catch{throw Error(`Falló Wrangler: ${args.slice(0,2).join(' ')}`);}}
async function post(action,body={}){const r=await fetch(helperUrl+'/'+action,{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error(`Falló la restauración R2 (HTTP ${r.status}).`);return r.json();}
async function digest(file){const hash=createHash('sha256');for await(const part of createReadStream(file))hash.update(part);return hash.digest('hex');}
function query(sql){return JSON.parse(wrangler(['d1','execute',targetDb,'--remote','--command',sql,'--json','--config',resolve(configPath)],undefined,true))[0];}
let deployed=false;
try{
 wrangler(['deploy','--config',helperConfig]);deployed=true;wrangler(['secret','put','COPY_SECRET','--config',helperConfig],secret);
 let ready=false;for(let i=0;i<12;i++){try{await post('list');ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}}if(!ready)throw Error('El restaurador R2 no está disponible.');
 const result=await restoreSnapshot({manifest,
  verifyDatabase:async expected=>(await digest(sourceSql))===expected,
  targetsEmpty:async()=>{const q=query("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'");return q.success&&q.results[0]?.n===0&&(await post('target-empty')).empty===true;},
  listObjects:async()=>{let cursor=null,objects=[];do{const p=await post('list',{cursor});objects.push(...p.objects);cursor=p.cursor;}while(cursor);return objects;},
  copyObject:object=>post('copy',object),
  restoreDatabase:async()=>wrangler(['d1','execute',targetDb,'--remote','--file',sourceSql,'--config',resolve(configPath)]),
  checkForeignKeys:async()=>{const q=query('PRAGMA foreign_key_check;');return q.success&&q.results.length===0;}
 });
 console.log(`Restauración QA completa: D1 y ${result.count} objetos verificados.`);
}finally{
 if(deployed){try{wrangler(['delete','--force','--config',helperConfig]);}catch{console.error(`No se pudo eliminar el Worker temporal ${worker}.`);}}
 await rm(dir,{recursive:true,force:true});
}
