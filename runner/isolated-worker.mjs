import {Worker} from 'node:worker_threads';

// Each task gets its own Node environment and module cache; Pi mutates process.env.
export function runIsolatedWorker({cli,configPath,cloudflareAccess,stdout=process.stdout,stderr=process.stderr}) {
 return new Promise((resolve,reject)=>{
  const worker=new Worker(cli,{argv:['run-once','--config',configPath],workerData:{saviaPoolSlot:true,cloudflareAccess},stdout:true,stderr:true});
  let outcome,slotError,failed=false;
  worker.stdout.on('data',chunk=>stdout.write(chunk));worker.stderr.on('data',chunk=>stderr.write(chunk));
  worker.on('message',message=>{if(message?.type==='savia-slot-result')outcome=message.outcome;else if(message?.type==='savia-slot-error')slotError=Object.assign(new Error('El agente no pudo terminar la tarea.'),{code:message.code,status:message.status});});
  worker.once('error',error=>{failed=true;reject(error);});
  worker.once('exit',code=>{if(failed)return;if(outcome)resolve(outcome);else reject(slotError||Object.assign(new Error('El agente terminó sin entregar su resultado.'),{code:'RUNNER_SLOT_EXIT',exitCode:code}));});
 });
}
