import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.SAVIA_HEADLESS_RUNNER='1';
const {createRejectionCheckHandler,createRejectionJobHandler}=await import(process.env.SAVIA_TEST_REJECTION_MODULE||new URL('../rejection-check.mjs',import.meta.url));

test('ejecuta las rondas del escritorio con Pi y comprueba los errores contra la oferta',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-rejection-runner-')),tasks=[];let closed=false,active=false;
 try{
  const handler=createRejectionCheckHandler({temporaryRoot:dir,createAiService:({configStore})=>{const c=configStore.load();assert.equal(c.text_model_provider,'anthropic-api');assert.equal(c.base_url,'https://api.anthropic.com');assert.equal(c.web_runner_anthropic_native,true);assert.equal(c.reasoning_effort,'');return {};},createRuntime:()=>({close:async()=>{closed=true;},runTask:async task=>{
   assert.equal(active,false,'Pi solo admite una tarea activa por runtime');active=true;tasks.push(task);await new Promise(resolve=>setTimeout(resolve,5));let output='Criterios del pliego: acreditar experiencia.';
   if(task.output_file==='response.json'){
    if(task.prompt.includes('TypoCheckFindings'))output=JSON.stringify({findings:[{bidDocumentId:'bid',wrongText:'experiensia',correctText:'experiencia',originalExcerpt:'acredita experiensia',reason:'Error'}, {bidDocumentId:'bid',wrongText:'inexistente',correctText:'válido',reason:'Inventado'}]});
    else if(task.prompt.includes('LogicCheckFindings'))output=JSON.stringify({findings:[{bidDocumentId:'bid',title:'Contradicción',originalText:'acredita experiensia',fallacyReason:'Inconsistencia',suggestion:'Revisar'}]});
    else output=JSON.stringify({findings:[{bidDocumentId:'bid',type:'rejectionItem',severity:'high',title:'Experiencia',requirement:'Acreditar experiencia',bidEvidence:'acredita experiensia',riskReason:'La evidencia requiere revisión',suggestion:'Revisar'}]});
   }
   const validation=task.validateOutput({output_content:output});assert.deepEqual(validation.issues,[]);active=false;return {validation_result:validation.value};
  }})});
  const payload={fileIds:['tender','bid'],tenderFileIds:['tender'],bidFileIds:['bid'],language:'es',dataProcessingConsent:true,options:{rejectionCheck:true,typoCheck:true,logicCheck:true},customCheckItems:'Verificar experiencia'};
  const context={signal:new AbortController().signal,job:{id:'job'},getCredential:async()=>({provider:'anthropic-api',model:'modelo',secret:'sk-ant-api-fixture'}),getFileInfo:async id=>({name:`${id}.txt`,contentType:'text/plain',bytes:Buffer.from(id==='bid'?'La oferta acredita experiensia en proyectos.':'El pliego exige acreditar experiencia.')})};
  const result=await handler(payload,context);assert.equal(result.status,'success');assert.equal(result.criteria.status,'success');assert.equal(result.rejectionCheckResult.findings.length,1);assert.equal(result.typoCheckResult.findings.length,1);assert.equal(result.typoCheckResult.findings[0].wrongText,'experiensia');assert.equal(result.logicCheckResult.findings.length,1);
  assert.ok(tasks.length>=6);assert.ok(tasks.every(task=>task.signal===context.signal));assert.ok(tasks.some(task=>task.prompt.includes('TypoCheckFindings')));assert.equal(JSON.stringify(tasks.map(task=>task.files)).includes('clave-secreta'),false);assert.equal(closed,true);assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('exige consentimiento y proveedor permitido antes de descargar documentos',async()=>{
 let calls=0;const handler=createRejectionCheckHandler({createAiService:()=>({}),createRuntime:()=>{throw Error('no debe ejecutarse');}}),context={signal:new AbortController().signal,job:{id:'job'},getCredential:async()=>({provider:'otro'}),getFileInfo:async()=>{calls++;}};
 const payload={fileIds:['bid'],tenderFileIds:[],bidFileIds:['bid'],language:'es',dataProcessingConsent:false,options:{rejectionCheck:false,typoCheck:true,logicCheck:false}};
 await assert.rejects(handler(payload,context),/consentimiento/i);await assert.rejects(handler({...payload,dataProcessingConsent:true},context),/proveedor compatible/i);assert.equal(calls,0);
});

test('conserva los resultados de otras secciones si una revisión falla',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-rejection-partial-'));try{
  const handler=createRejectionCheckHandler({temporaryRoot:dir,createAiService:()=>({}),createRuntime:()=>({close:async()=>{},runTask:async task=>{if(task.prompt.includes('TypoCheckFindings'))throw Error('Fallo simulado');const validation=task.validateOutput({output_content:JSON.stringify({findings:[{bidDocumentId:'bid',title:'Coherencia',originalText:'Plazo',fallacyReason:'Contradicción',suggestion:'Revisar'}]})});return {validation_result:validation.value};}})});
  const payload={fileIds:['bid'],tenderFileIds:[],bidFileIds:['bid'],language:'es',dataProcessingConsent:true,options:{rejectionCheck:false,typoCheck:true,logicCheck:true}};
  const context={signal:new AbortController().signal,job:{id:'job'},getCredential:async()=>({provider:'opencode-go',model:'modelo',secret:'clave'}),getFileInfo:async()=>({name:'oferta.txt',contentType:'text/plain',bytes:Buffer.from('Plazo de ejecución de 30 días.')})};
  const result=await handler(payload,context);assert.equal(result.status,'error');assert.equal(result.typoCheckResult.status,'error');assert.equal(result.logicCheckResult.status,'success');assert.equal(result.logicCheckResult.findings.length,1);assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('la cancelación interrumpe Pi y limpia los temporales',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-rejection-abort-')),controller=new AbortController();let closed=false;
 try{
  const handler=createRejectionCheckHandler({temporaryRoot:dir,createAiService:()=>({}),createRuntime:()=>({close:async()=>{closed=true;},runTask:async()=>{controller.abort();throw controller.signal.reason;}})});
  const payload={fileIds:['bid'],tenderFileIds:[],bidFileIds:['bid'],language:'es',dataProcessingConsent:true,options:{rejectionCheck:false,typoCheck:true,logicCheck:false}};
  await assert.rejects(handler(payload,{signal:controller.signal,job:{id:'job'},getCredential:async()=>({provider:'opencode-go',model:'modelo',secret:'clave'}),getFileInfo:async()=>({name:'oferta.txt',contentType:'text/plain',bytes:Buffer.from('Texto de oferta')})}));assert.equal(closed,true);assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('el runtime Pi real lee las instrucciones y guarda el resultado con herramientas',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-rejection-pi-'));let calls=0;
 try{
  const createAiService=({configStore})=>({getConfig:()=>configStore.load(),getTextQueueStatus:()=>({active:0,queued:0,limit:1}),async runAgentChatCompletion(request){
   calls++;const ctx={config:configStore.load(),requestBody:{...request.body,stream:false},requestId:'fixture'};request.onRequestStart?.(ctx);
   const payload=JSON.stringify({findings:[{bidDocumentId:'bid',wrongText:'experiensia',correctText:'experiencia',originalExcerpt:'acredita experiensia',reason:'Error'}]});
   const message=calls===1?{role:'assistant',content:null,tool_calls:[{id:'read',type:'function',function:{name:'read',arguments:JSON.stringify({path:'messages.json'})}}]}:calls===2?{role:'assistant',content:null,tool_calls:[{id:'write',type:'function',function:{name:'write',arguments:JSON.stringify({path:'response.json',content:payload})}}]}:{role:'assistant',content:'Listo.'};
   return request.consumeResponse(new Response(JSON.stringify({id:`response-${calls}`,object:'chat.completion',model:'fixture',choices:[{index:0,message,finish_reason:calls<=2?'tool_calls':'stop'}]}),{headers:{'content-type':'application/json'}}),ctx);
  }});
  const handler=createRejectionCheckHandler({temporaryRoot:dir,createAiService});
  const result=await handler({fileIds:['bid'],tenderFileIds:[],bidFileIds:['bid'],language:'es',dataProcessingConsent:true,options:{rejectionCheck:false,typoCheck:true,logicCheck:false}},{signal:new AbortController().signal,job:{id:'job'},getCredential:async()=>({provider:'opencode-go',model:'modelo',secret:'clave'}),getFileInfo:async()=>({name:'oferta.txt',contentType:'text/plain',bytes:Buffer.from('La oferta acredita experiensia en proyectos.')})});
  assert.equal(result.status,'success');assert.equal(result.typoCheckResult.findings[0].wrongText,'experiensia');assert.equal(calls,3);assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('extrae criterios por separado para revisarlos antes de evaluar ofertas',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-rejection-criteria-'));try{
  const handler=createRejectionCheckHandler({temporaryRoot:dir,createAiService:()=>({}),createRuntime:()=>({close:async()=>{},runTask:async task=>{const checked=task.validateOutput({output_content:'# Causales\n- Acreditar experiencia.'});return {validation_result:checked.value};}})});
  const result=await handler({mode:'extract',fileIds:['t'],tenderFileIds:['t'],bidFileIds:[],language:'es',dataProcessingConsent:true},{signal:new AbortController().signal,job:{id:'job'},getCredential:async()=>({provider:'opencode-go',model:'modelo',secret:'clave'}),getFileInfo:async()=>({name:'pliego.txt',contentType:'text/plain',bytes:Buffer.from('Se exige acreditar experiencia.')})});
  assert.equal(result.criteria.status,'success');assert.match(result.criteria.content,/Acreditar experiencia/);assert.equal(result.rejectionCheckResult,undefined);assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('el runner distribuible anuncia los dos tipos de tarea de rechazo',async()=>{
 const {createServer}=await import('node:http'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util');const dir=await mkdtemp(join(tmpdir(),'savia-rejection-cli-'));let kinds=[];
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;if(req.url==='/api/runner/jobs/claim')kinds=JSON.parse(body).kinds;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({job:null}));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const config=join(dir,'runner.json');await writeFile(config,JSON.stringify({server:`http://127.0.0.1:${server.address().port}`,runnerId:'runner',token:'fixture-token'}));const cli=process.env.SAVIA_TEST_RUNNER_CLI||new URL('../cli.mjs',import.meta.url).pathname;await promisify(execFile)(process.execPath,[cli,'run-once','--config',config]);assert.ok(kinds.includes('rejection-check.extract'));assert.ok(kinds.includes('rejection-check.analyze'));}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('no guarda credenciales en el informe aunque un error del proveedor las incluya',async()=>{
 let uploaded='';const handler=createRejectionJobHandler({createAiService:()=>({}),createRuntime:()=>({close:async()=>{},runTask:async()=>{throw Error('Fallo con clave-secreta');}})});
 const result=await handler({mode:'analyze',fileIds:['bid'],tenderFileIds:[],bidFileIds:['bid'],language:'es',dataProcessingConsent:true,options:{rejectionCheck:false,typoCheck:true,logicCheck:false}},{signal:new AbortController().signal,job:{id:'job'},getCredential:async()=>({provider:'opencode-go',model:'modelo',secret:'clave-secreta'}),getFileInfo:async()=>({name:'oferta.txt',contentType:'text/plain',bytes:Buffer.from('Contenido de oferta')}),uploadArtifact:async bytes=>{uploaded=bytes.toString();return {id:'artifact'};}});
 assert.equal(result.analysisStatus,'error');assert.equal(uploaded.includes('clave-secreta'),false);assert.match(uploaded,/\[redactado\]/);
});

test('rechaza JSON de hallazgos con estructura inesperada en lugar de dar un resultado vacío',async()=>{
 let checked=false;const handler=createRejectionCheckHandler({createAiService:()=>({}),createRuntime:()=>({close:async()=>{},runTask:async task=>{const invalid=task.validateOutput({output_content:'{"otro":[]}'});assert.ok(invalid.issues.some(issue=>issue.severity==='blocking'));checked=true;return {validation_result:task.validateOutput({output_content:'{"findings":[]}'}).value};}})});
 const result=await handler({fileIds:['bid'],tenderFileIds:[],bidFileIds:['bid'],language:'es',dataProcessingConsent:true,options:{rejectionCheck:false,typoCheck:true,logicCheck:false}},{signal:new AbortController().signal,job:{id:'job'},getCredential:async()=>({provider:'opencode-go',model:'modelo',secret:'clave'}),getFileInfo:async()=>({name:'oferta.txt',contentType:'text/plain',bytes:Buffer.from('Texto de oferta')})});assert.equal(checked,true);assert.equal(result.typoCheckResult.status,'success');
});

test('acepta Markdown cuando el navegador envía tipo genérico',async()=>{
 const handler=createRejectionCheckHandler({createAiService:()=>({}),createRuntime:()=>({close:async()=>{},runTask:async task=>({validation_result:task.validateOutput({output_content:'{"findings":[]}'}).value})})});
 const result=await handler({fileIds:['bid'],tenderFileIds:[],bidFileIds:['bid'],language:'es',dataProcessingConsent:true,options:{rejectionCheck:false,typoCheck:true,logicCheck:false}},{signal:new AbortController().signal,job:{id:'job'},getCredential:async()=>({provider:'opencode-go',model:'modelo',secret:'clave'}),getFileInfo:async()=>({name:'oferta.md',contentType:'application/octet-stream',bytes:Buffer.from('Contenido de oferta')})});assert.equal(result.status,'success');
});
