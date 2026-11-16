import {setTimeout as delay} from 'node:timers/promises';
import {runnerPollDelay} from './opportunity-runner-scheduler.mjs';

// Running jobs retain their leases when the limit is lowered; only new claims stop.
export async function runWorkerPool({signal,run,recover,getLimit,onOutcome=()=>{},onError=()=>{},onIdle=()=>{},intervalOverride,intervalMs=1000,refreshMs=10000,wait}) {
 const active=new Set();let limit=1,nextRefresh=0,nextPoll=0,needsRecovery=false;
 const start=()=>{let task;task=Promise.resolve().then(run).then(outcome=>{onOutcome(outcome);if(outcome.state==='idle'){nextPoll=Math.max(nextPoll,Date.now()+runnerPollDelay('idle',intervalOverride,outcome.pollAfterMs));onIdle();}else nextPoll=0;},error=>{if(String(error?.code||'').startsWith('OUTBOX_'))needsRecovery=true;onError(error);nextPoll=Math.max(nextPoll,Date.now()+runnerPollDelay('idle',intervalOverride));}).finally(()=>active.delete(task));active.add(task);};
 while(!signal.aborted){
  const now=Date.now();
  if(now>=nextRefresh){nextRefresh=now+refreshMs;try{const next=await getLimit();if(Number.isInteger(next)&&next>=1&&next<=4)limit=next;}catch(error){onError(error);}}
  if(!signal.aborted&&active.size<limit&&now>=nextPoll&&(!needsRecovery||active.size===0)){
   if(active.size===0){try{await recover();needsRecovery=false;}catch(error){needsRecovery=true;onError(error);nextPoll=Date.now()+runnerPollDelay('idle',intervalOverride);}}
   if(!needsRecovery&&Date.now()>=nextPoll&&!signal.aborted)while(active.size<limit)start();
  }
  try{const reason=wait?await wait(intervalMs):await delay(intervalMs,undefined,{signal});if(reason==='notification')nextPoll=0;}catch{if(!signal.aborted)throw new Error('No se pudo programar el runner.');}
 }
 await Promise.allSettled([...active]);
}
