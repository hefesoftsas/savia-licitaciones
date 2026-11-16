import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const moduleUrl=process.env.SAVIA_TEST_PACKAGED_RUNNER?pathToFileURL(join(process.env.SAVIA_TEST_PACKAGED_RUNNER,'runner','launcher.mjs')).href:new URL('../launcher.mjs',import.meta.url).href;
const {runGuidedLauncher,supportedNode}=await import(moduleUrl);

test('empareja antes de iniciar sin pasar el código como argumento',async()=>{
 const answers=['https://savia.example','Equipo de prueba','ab'.repeat(32)],calls=[],messages=[];
 await runGuidedLauncher({configured:false,ask:async()=>answers.shift(),write:value=>messages.push(value),execute:async(args,input)=>{calls.push({args,input});return 0;}});
 assert.deepEqual(calls,[{args:['pair','--server','https://savia.example','--name','Equipo de prueba'],input:'ab'.repeat(32)+'\n'},{args:['run'],input:undefined}]);
 assert.ok(!JSON.stringify(calls[0].args).includes('ab'.repeat(32)));assert.ok(!messages.join('').includes('ab'.repeat(32)));
});
test('no inicia si falla la conexión y arranca directamente si ya existe configuración',async()=>{
 const calls=[],answer=['https://savia.example','','ab'.repeat(32)];let code=await runGuidedLauncher({configured:false,ask:async()=>answer.shift(),write:()=>{},execute:async(args)=>{calls.push(args);return 1;}});assert.equal(code,1);assert.equal(calls.length,1);
 calls.length=0;code=await runGuidedLauncher({configured:true,ask:async()=>{throw Error('no prompt');},write:()=>{},execute:async(args)=>{calls.push(args);return 0;}});assert.equal(code,0);assert.deepEqual(calls,[['run']]);
});

test('exige una versión de Node compatible',async()=>{
 assert.equal(supportedNode('22.12.9'),false);assert.equal(supportedNode('22.13.0'),true);assert.equal(supportedNode('24.0.0'),true);assert.equal(supportedNode('invalid'),false);
});

test('el inicio guiado empareja con el CLI real antes de arrancar',{timeout:15000},async()=>{
 const {createServer}=await import('node:http'),{spawn}=await import('node:child_process'),{mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os');
 const dir=await mkdtemp(join(tmpdir(),'savia-launcher-test-')),config=join(dir,'runner.json'),code='a'.repeat(64),token='b'.repeat(64);let received;
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received=JSON.parse(body);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({runner:{id:'runner'},token}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const cli=process.env.SAVIA_TEST_PACKAGED_RUNNER?join(process.env.SAVIA_TEST_PACKAGED_RUNNER,'runner','cli.mjs'):fileURLToPath(new URL('../cli.mjs',import.meta.url));
  const answers=[`http://127.0.0.1:${server.address().port}`,'Equipo',code],messages=[];let ran=false;
  const result=await runGuidedLauncher({configured:false,ask:async()=>answers.shift(),write:x=>messages.push(x),execute:async(args,input)=>{if(args[0]==='run'){ran=true;return 0;}return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cli,...args,'--config',config],{stdio:['pipe','pipe','pipe']});child.once('error',reject);child.once('exit',status=>resolve(status));child.stdin.end(input);});}});
  assert.equal(result,0);assert.equal(ran,true);assert.deepEqual(received,{code,name:'Equipo'});const saved=JSON.parse(await readFile(config,'utf8'));assert.equal(saved.token,token);assert.ok(!messages.join('').includes(code));
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
