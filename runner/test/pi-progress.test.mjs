import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trackPiProgress} from '../pi-progress.mjs';
test('informa solo etapas genéricas y distingue lectura de escritura', async () => {
 const stages=[], forwarded=[];
 const runtime={async runTask(task){task.onActivity({source:'pi.tool.start',meta:{tool:'read'},message:'documento privado'});task.onActivity({source:'pi.tool.start',meta:{tool:'write'},message:'texto privado'});task.onActivity({source:'pi.message',message:'respuesta privada'});return 1;}};
 trackPiProgress(runtime,{reportProgress:stage=>stages.push(stage)});
 assert.equal(await runtime.runTask({onActivity:event=>forwarded.push(event.source)}),1);
 assert.deepEqual(stages,['generating','reading','generating','generating']);
 assert.deepEqual(forwarded,['pi.tool.start','pi.tool.start','pi.message']);
});

test('reenvía el uso sin perder el callback del llamador', async () => {
 const shared=[], original=[];
 const runtime={async runTask(task){task.onUsage({input:7});return 1;}};
 trackPiProgress(runtime,{reportUsage:usage=>shared.push(usage)});
 await runtime.runTask({onUsage:usage=>original.push(usage)});
 assert.deepEqual(shared,[{input:7}]);assert.deepEqual(original,shared);
});

test('publica actividad de herramientas sin mensajes ni argumentos privados',async()=>{
 const activity=[];
 const runtime={runTask:async task=>{task.onActivity({source:'pi.tool.start',message:'private document',meta:{tool:'read',args:{secret:'hidden'}}});task.onActivity({source:'pi.tool.end',message:'private error',meta:{tool:'read',is_error:true}});}};
 trackPiProgress(runtime,{reportActivity:code=>activity.push(code)});
 await runtime.runTask({});
 assert.deepEqual(activity,['tool.read.start','tool.read.error']);
});

test('forwards execution console independently of categorical progress',async()=>{
 const events=[],original=[];const entry={event:'tool.end',tool:'read',result:{content:[{type:'text',text:'Documento completo'}]}};
 const runtime={runTask:async task=>task.onConsole(entry)};
 trackPiProgress(runtime,{reportConsole:event=>events.push(event)});
 await runtime.runTask({onConsole:event=>original.push(event)});
 assert.deepEqual(events,[entry]);assert.deepEqual(original,events);
});
