#!/usr/bin/env node
// Recovery is restricted to the lock created by this particular QA capture.
import {readFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const directory=process.argv[2];if(!directory)throw Error('Uso: node infra/web/qa_unlock.mjs DIRECTORIO_RESPALDO');
const recovery=join(resolve(directory),'lock-recovery.json'),record=JSON.parse(await readFile(recovery,'utf8'));
if(record.url!=='https://savia-web-runner-qa.jose-douglas-dev.workers.dev'||!Number.isSafeInteger(record.pid)||!/^[a-f0-9]{64}$/.test(record.nonce||''))throw Error('Archivo de recuperación inválido.');
try{process.kill(record.pid,0);throw Error('El proceso de respaldo sigue activo; no se liberó la barrera.');}catch(error){if(error.code!=='ESRCH')throw error;}
const token=await readFile(join(process.env.HOME,'.savia/cloudflare-qa/backup-control-token'),'utf8');
const r=await fetch(record.url+'/api/_backup/unlock',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({nonce:record.nonce})});
if(!r.ok)throw Error(`No se pudo liberar la barrera (HTTP ${r.status}).`);
await unlink(recovery);console.log('Barrera de QA liberada. La captura interrumpida no se considera completa.');
