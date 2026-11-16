import {parentPort,workerData} from 'node:worker_threads';
import {runOnce} from '../../work-loop.mjs';
const outcome=await runOnce({server:workerData.server,token:'fixture-token',localCredentialLoader:async()=>null,captureConsole:true,onActivity:event=>parentPort.postMessage({event}),handlers:{fixture:async(payload)=>{
 process.env.PI_CODING_AGENT_DIR=`job-${payload.n}`;
 process.stdout.write(`job ${payload.n}\n`);
 await fetch(`${workerData.server}/barrier`,{method:'POST'});
 return {value:payload.n,environment:process.env.PI_CODING_AGENT_DIR};
}}});
parentPort.postMessage({outcome});
