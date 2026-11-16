import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureProcessConsole} from '../process-console.mjs';
test('captures stdout/stderr, buffers split UTF-8 and flushes/restores on completion',async()=>{
 const entries=[],original=()=>false,streams={stdout:{write:original},stderr:{write:original}};
 const restore=captureProcessConsole(entry=>entries.push(entry),streams);
 const bytes=Buffer.from('página\n');streams.stdout.write(bytes.subarray(0,2));streams.stdout.write(bytes.subarray(2));
 let called=false;streams.stderr.write('actual error',()=>{called=true;});await Promise.resolve();assert.equal(called,true);
 restore();assert.deepEqual(entries,[{event:'process.stdout',text:'página'},{event:'process.stderr',text:'actual error'}]);assert.equal(streams.stdout.write,original);assert.equal(streams.stderr.write,original);
});

test('real task stdout and stderr reach the console without recursive protocol writes or leaked credentials',async()=>{
 const {execFileSync}=await import('node:child_process');
 const source=`
 import {createServer} from 'node:http';
 import {runOnce} from ${JSON.stringify(new URL('../work-loop.mjs',import.meta.url).href)};
 const output=process.stdout.write.bind(process.stdout),events=[];
 const server=createServer(async(req,res)=>{for await(const chunk of req){}res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url.endsWith('/claim')?{job:{id:'fixture',kind:'test',payload:{}},lease:'lease-secret',leaseDurationMs:60000}:{ok:true}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const result=await runOnce({server:'http://127.0.0.1:'+server.address().port,token:'private-token',captureConsole:true,onActivity:e=>{events.push(e);output('protocol\\n');},handlers:{test:async()=>{process.stdout.write('engine stdout private-');process.stdout.write('token\\n');process.stderr.write('engine error lease-secret\\n');return {ok:true};}}});output(JSON.stringify({state:result.state,events}));}finally{server.closeAllConnections();server.close();}
 `;
 const output=execFileSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:10000});
 const result=JSON.parse(output.slice(output.lastIndexOf('\n')+1));assert.equal(result.state,'succeeded');
 const text=JSON.stringify(result.events);assert.match(text,/process.stdout/);assert.match(text,/process.stderr/);assert.match(text,/engine stdout/);assert.doesNotMatch(text,/private-token|lease-secret/);assert.ok(result.events.length<10);
});
