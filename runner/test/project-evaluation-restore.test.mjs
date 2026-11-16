import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';import {validateProjectEvaluations} from '../project-evaluation-restore.mjs';
test('valida informes, revisiones y hashes antes de crear el proyecto',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-evaluation-restore-'));try{
 const data={tenderSources:[{id:'t',name:'Pliego',text:'Cita'}],bidSources:[],result:{criteria:[{id:'c',name:'Criterio',tenderSourceId:'t',tenderQuote:'Cita',bidSourceId:null,bidQuote:'',explanation:'',maxPoints:10,proposedPoints:null}],unreadableDocuments:[],discardedCount:0,total:null}},bytes=Buffer.from(JSON.stringify(data)),sha=createHash('sha256').update(bytes).digest('hex');await writeFile(join(dir,'report'),bytes);const objects=new Map([['evaluation:one',{file:'report',size:bytes.length,sha256:sha}]]),item={id:'one',status:'completed',createdAt:'2026',updatedAt:'2026',error:null,reviews:[{criterionId:'c',status:'adjusted',score:7,note:'Bien',updatedAt:'2026'}],source:{size:bytes.length,sha256:sha}};
 assert.deepEqual([...await validateProjectEvaluations({evaluations:[item],objects,directory:dir})],['evaluation:one']);
 await assert.rejects(validateProjectEvaluations({evaluations:[{...item,reviews:[{...item.reviews[0],score:11}]}],objects,directory:dir}));
 await assert.rejects(validateProjectEvaluations({evaluations:[item,item],objects,directory:dir}));
 await writeFile(join(dir,'report'),'contenido alterado');await assert.rejects(validateProjectEvaluations({evaluations:[item],objects,directory:dir}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
