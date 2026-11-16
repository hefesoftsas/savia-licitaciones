import {test} from 'node:test';import assert from 'node:assert/strict';import {startOpportunityScheduler} from '../src/features/web/opportunity-scheduler.mjs';
test('comprueba al abrir, evita llamadas simultáneas y detiene el temporizador al cerrar',async()=>{
 let tick,cleared=false,calls=0,finish,signal;const send=async value=>{calls++;signal=value;await new Promise(resolve=>{finish=resolve;});};
 const stop=startOpportunityScheduler({send,setInterval:fn=>{tick=fn;return 7;},clearInterval:id=>{assert.equal(id,7);cleared=true;}});assert.equal(calls,1);tick();assert.equal(calls,1);finish();await new Promise(resolve=>setImmediate(resolve));tick();assert.equal(calls,2);stop();assert.equal(cleared,true);assert.equal(signal.aborted,true);finish();
});
