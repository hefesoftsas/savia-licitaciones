import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
process.env.SAVIA_HEADLESS_RUNNER='1';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {runOnce}=await import('../../runner/work-loop.mjs');
const {readLocalOpenCodeConfig}=await import('../../runner/local-opencode-config.mjs');
const {createRupAnalysisHandler}=await import('../../runner/rup-analysis.mjs');
const {createKnowledgeAnalysisHandler}=await import('../../runner/knowledge-analysis.mjs');
const {createFeasibilityAnalysisHandler}=await import('../../runner/feasibility-analysis.mjs');
const {createFeasibilityOutlineHandler}=await import('../../runner/feasibility-outline.mjs');
const {createFeasibilityParametersHandler}=await import('../../runner/feasibility-parameters.mjs');
const {createFeasibilityContentHandler}=await import('../../runner/feasibility-content.mjs');
const require=createRequire(new URL('../../client/package.json',import.meta.url));
const {PDFDocument}=require('pdf-lib');
const credential=await readLocalOpenCodeConfig();if(!credential)throw new Error('Falta el modelo de OpenCode Go configurado en este equipo.');
const build=await mkdtemp(join(tmpdir(),'savia-real-ai-'));let worker;
try {
 execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',build],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
 worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(build,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'real-ai-isolated'},r2Buckets:['FILES'],bindings:{AUTH_ALLOW_REGISTRATION:'true',BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost',CREDENTIAL_KEY_HEX:'11'.repeat(32),CREDENTIAL_KEY_ID:'test'}}));
 const db=await worker.getD1Database('DB');for(const f of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',f),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
 const req=(path,opts={})=>worker.dispatchFetch('http://localhost'+path,opts);let cookie;
 const post=async(path,body,key,method='POST')=>{const r=await req(path,{method,headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{}),...(key?{'idempotency-key':key}:{})},body:JSON.stringify(body)});if(!r.ok)throw new Error(`${method} ${path}: HTTP ${r.status} ${await r.text()}`);return r.json();};
 const signup=await req('/api/auth/sign-up/email',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({name:'Prueba aislada',email:'aislado@example.test',password:'password-test-12345'})});assert.equal(signup.status,200);cookie=signup.headers.get('set-cookie').split(';')[0];
 const pairing=await post('/api/runner-pairings',{}),runner=await post('/api/runners/pair',{code:pairing.code,name:'Runner de prueba'}),server=(await worker.ready).origin;
 const run=async(kind,handler)=>{console.log(`INICIO ${kind}`);const result=await runOnce({server,token:runner.token,handlers:{[kind]:handler},localCredentialLoader:async()=>credential,onActivity:event=>{if(event?.event==='tool.start')console.log(`${kind}: herramienta`);}});console.log(`FIN ${kind}: ${result.state}`);if(result.state!=='succeeded'){const row=await db.prepare('SELECT result_json FROM account_jobs WHERE id=?').bind(result.jobId).first();let info;try{info=JSON.parse(row?.result_json||'{}').message}catch{}throw new Error(`${kind} falló: ${info||result.state}`);}const saved=await db.prepare('SELECT result_json FROM account_jobs WHERE id=?').bind(result.jobId).first();const value=JSON.parse(saved?.result_json||'{}');if(kind==='rup.analyze')assert.ok(value.suggestions?.length,'El RUP no produjo datos');if(kind==='knowledge.analyze')assert.ok(value.entries?.length,'La biblioteca no produjo entradas');return result;};
 if(!process.env.SAVIA_CONTENT_ONLY){
 const doc=await PDFDocument.create();doc.addPage().drawText('REGISTRO UNICO DE PROPONENTES - DATOS DE PRUEBA\nExperiencia: mantenimiento preventivo de equipos.\nIndicador de liquidez: 1.25\nCapital de trabajo: 50000000 COP.',{x:40,y:700,size:12});const bytes=await doc.save();
 const upload=await req('/api/rup/certificate',{method:'PUT',headers:{cookie,origin:'http://localhost','x-rup-version':'0','x-file-name':'RUP-prueba.pdf','content-type':'application/pdf'},body:bytes});assert.equal(upload.status,200,await upload.clone().text());const cert=await upload.json();
 await post('/api/rup/analyses',{certificateId:cert.certificate.id,certificateVersion:cert.version,credentialId:'local-runner',language:'es',dataProcessingConsent:true},'rup');await run('rup.analyze',createRupAnalysisHandler());
 const folder=(await post('/api/knowledge/folders',{name:'Datos de prueba'})).folder;const file=await req(`/api/knowledge/folders/${folder.id}/documents`,{method:'POST',headers:{cookie,origin:'http://localhost','x-file-name':'experiencia-prueba.txt','content-type':'text/plain'},body:'Experiencia de prueba: mantenimiento preventivo y correctivo de 20 computadores para una entidad pública. Duración: seis meses.'});assert.equal(file.status,201,await file.clone().text());const document=(await file.json()).document;
 await post(`/api/knowledge/documents/${document.id}/analyses`,{credentialId:'local-runner',language:'es',dataProcessingConsent:true},'knowledge');await run('knowledge.analyze',createKnowledgeAnalysisHandler());
 }
 if(!process.env.SAVIA_CORE_ONLY){
 const report={step:'sources',projectInfo:{projectName:'Centro comunitario de prueba',projectType:'government',industry:'Servicios comunitarios',constructionUnit:'Municipio de prueba',location:'Bogotá',constructionContent:'Adecuación de dos salas comunitarias',constructionPeriodYears:'1',operationPeriodYears:'5',totalInvestment:'100000000',fundingSource:'Recursos propios'},sourceFiles:[],analysisMarkdown:'',outlineTemplate:'government',targetWords:1000,referenceDocumentIds:[],keyParametersMarkdown:'',outlineData:null};if(process.env.SAVIA_CONTENT_ONLY){report.step='content';report.analysisMarkdown='Se adecuarán dos salas comunitarias en Bogotá.';report.keyParametersMarkdown='Inversión: 100000000 COP. Plazo: un año.';report.outlineData={outline:[{id:'capitulo-prueba',title:'Alcance',description:'Describir la adecuación de las salas',content:'',children:[]}]};}
 await post('/api/feasibility-report',{report,version:0},null,'PUT');
 let version=1;
 if(!process.env.SAVIA_CONTENT_ONLY)for(const [kind,path,handler] of [['feasibility.analyze','analyses',createFeasibilityAnalysisHandler()],['feasibility.generate-outline','outlines',createFeasibilityOutlineHandler()],['feasibility.generate-parameters','parameters',createFeasibilityParametersHandler()]]){
  const job=(await post(`/api/feasibility-report/${path}`,{version,language:'es',credentialId:'local-runner',dataProcessingConsent:true},path)).job;await run(kind,handler);const applied=await post(`/api/feasibility-report/${path}/${job.id}/apply`,{version});version=applied.version;
 }
 const job=(await post('/api/feasibility-report/content-jobs',{version,language:'es',credentialId:'local-runner',dataProcessingConsent:true,mode:'missing'},'content')).job;await run('feasibility.generate-content',createFeasibilityContentHandler());const results=await req(`/api/feasibility-report/content-jobs/${job.id}/drafts`,{headers:{cookie}});assert.equal(results.status,200);assert.ok((await results.json()).drafts.length);const saved=await post(`/api/feasibility-report/content-jobs/${job.id}/apply`,{version});assert.ok(saved.version>version);console.log('Borrador guardado en el informe aislado.');
 }
 console.log('Todas las pruebas aisladas finalizaron correctamente.');
} finally {await worker?.dispose();await rm(build,{recursive:true,force:true});}
