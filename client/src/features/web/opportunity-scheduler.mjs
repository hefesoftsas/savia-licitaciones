// A tab only requests a due check; the server owns timing and cross-tab coordination.
export function startOpportunityScheduler({send,setInterval,clearInterval}) {
 let stopped=false,running=false;const controller=new AbortController();
 const tick=async()=>{if(stopped||running)return;running=true;try{await send(controller.signal);}catch{/* The server enforces retries; try on the next tick. */}finally{running=false;}};
 void tick();const timer=setInterval(()=>void tick(),60000);
 return ()=>{stopped=true;controller.abort();clearInterval(timer);};
}
