// Checks only when a compatible local runner is idle. Server-side leases coordinate runners.
export function createOpportunityRunnerScheduler({send,clock=()=>Date.now(),intervalMs=900000}){
 let stopped=false,running=false,last=-Infinity;const controller=new AbortController();
 return {
  async tick(){const now=clock();if(stopped||running||now-last<intervalMs)return;last=now;running=true;try{await send(controller.signal);}catch{/* Retry on the next interval; the server owns the schedule. */}finally{running=false;}},
  stop(){stopped=true;controller.abort();},
 };
}

// An explicit --poll-ms retains its existing behaviour; otherwise idle runners
// check every ten seconds and return to a short delay after processing a task.
export function runnerPollDelay(state,override,configured) {
 return override===undefined ? (state==='idle'?(configured??10000):3000) : override;
}
