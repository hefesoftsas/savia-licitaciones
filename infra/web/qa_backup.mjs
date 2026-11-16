#!/usr/bin/env node
// This command is deliberately restricted to the dedicated Savia QA account
// resources. It is not a production backup service or scheduler.
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {chmod,mkdir,readFile,rm,stat,unlink,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureSnapshot} from './cloud_backup.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),web=join(root,'web-api');
const [configPath,targetBucket,directory]=process.argv.slice(2);
if(!configPath||!targetBucket||!directory)throw Error('Uso: node infra/web/qa_backup.mjs CONFIG_QA BUCKET_RESPALDO DIRECTORIO_NUEVO');
const config=JSON.parse(await readFile(resolve(configPath),'utf8'));
const source=config.r2_buckets?.find(x=>x.binding==='FILES')?.bucket_name,db=config.d1_databases?.find(x=>x.binding==='DB');
const base=new URL(config.vars?.BETTER_AUTH_URL||'');
if(config.name!=='savia-web-runner-qa'||db?.database_name!=='savia-web-runner-qa'||source!=='savia-web-runner-qa-files'||targetBucket!=='savia-web-runner-qa-backup'||base.hostname!=='savia-web-runner-qa.jose-douglas-dev.workers.dev'||config.vars.BACKUP_GATE_ENABLED!=='true')throw Error('Este comando solo admite los recursos aislados de QA y la barrera activa.');
const output=resolve(directory);await mkdir(output,{mode:0o700});await chmod(output,0o700);
const nonce=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex'),id=randomUUID();
const prefix=`snapshots/${id}/objects/`,worker=`savia-qa-backup-${id.slice(0,8)}`,helperUrl=`https://${worker}.jose-douglas-dev.workers.dev`;
const controlToken=await readFile(join(process.env.HOME,'.savia/cloudflare-qa/backup-control-token'),'utf8');
const helperConfig=join(output,'copy-worker.json'),recovery=join(output,'lock-recovery.json');
const cfg={name:worker,account_id:config.account_id,main:join(root,'infra/web/r2_copy_worker.mjs'),compatibility_date:'2026-10-30',compatibility_flags:['nodejs_compat'],workers_dev:true,r2_buckets:[{binding:'SOURCE',bucket_name:source},{binding:'TARGET',bucket_name:targetBucket}],vars:{SOURCE_PREFIX:'',TARGET_PREFIX:prefix}};
await writeFile(helperConfig,JSON.stringify(cfg,null,2),{mode:0o600,flag:'wx'});
// Written before locking so an operator can safely release after interruption.
await writeFile(recovery,JSON.stringify({url:base.origin,nonce,pid:process.pid}),{mode:0o600,flag:'wx'});
function wrangler(args,input){try{execFileSync('pnpm',['exec','wrangler',...args],{cwd:web,stdio:['pipe','ignore','pipe'],input,timeout:300000});}catch{throw Error(`Falló Wrangler: ${args.slice(0,2).join(' ')}`);}}
async function post(url,token,body){const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error(`Falló una operación de respaldo (HTTP ${response.status}).`);return response.json();}
const gate={lock:()=>post(base.origin+'/api/_backup/lock',controlToken,{nonce}),status:()=>post(base.origin+'/api/_backup/status',controlToken,{nonce}),unlock:()=>post(base.origin+'/api/_backup/unlock',controlToken,{nonce})};
const copy=(action,body)=>post(helperUrl+'/'+action,secret,body);
async function digest(file){const hash=createHash('sha256');for await(const part of createReadStream(file))hash.update(part);return hash.digest('hex');}
let deployed=false;
try{
 wrangler(['deploy','--config',helperConfig]);deployed=true;
 wrangler(['secret','put','COPY_SECRET','--config',helperConfig],secret);
 // Workers.dev routes may take a short time to become reachable.
 let ready=false;for(let i=0;i<12;i++){try{await copy('list',{});ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 if(!ready)throw Error('El copiador aislado no está disponible.');
 const result=await captureSnapshot({gate,
  exportDatabase:async()=>{
   const file=join(output,'d1-export.sql'),ordered=join(output,'d1-restore.sql');
   wrangler(['d1','export',db.database_name,'--remote','--output',file,'--config',resolve(configPath)]);
   await chmod(file,0o600);if((await stat(file)).size>512*1024*1024)throw Error('La exportación excede el límite admitido para esta prueba QA.');
   execFileSync('python3',[join(root,'infra/web/d1_restore.py'),file,ordered],{stdio:'ignore',timeout:120000});
   return {name:db.database_name,sha256:await digest(file),restoreSha256:await digest(ordered)};
  },
  copyObjects:async()=>{
   const objects=[];let cursor=null;
   do{const page=await copy('list',{cursor});for(const item of page.objects){const saved=await copy('copy',item);objects.push({key:item.key,size:saved.size,sha256:saved.sha256});}cursor=page.cursor;}while(cursor);
   return {bucket:targetBucket,prefix,count:objects.length,objects};
  },
  saveManifest:async data=>writeFile(join(output,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),...data},null,2),{mode:0o600,flag:'wx'})
 });
 await unlink(recovery);
 await writeFile(join(output,'complete.json'),JSON.stringify({version:1,manifestSha256:await digest(join(output,'manifest.json'))}),{mode:0o600,flag:'wx'});
 console.log(`Respaldo QA creado: D1 y ${result.count} objetos verificados.`);
}finally{
 if(deployed){try{wrangler(['delete','--force','--config',helperConfig]);}catch{console.error(`No se pudo eliminar el Worker temporal ${worker}.`);}}
 await rm(helperConfig,{force:true});
}
