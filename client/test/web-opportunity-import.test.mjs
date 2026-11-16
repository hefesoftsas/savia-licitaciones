import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareOpportunity,selectableDocument,selectLoadedDocuments} from '../src/features/web/opportunity-import.mjs';
test('prepara el proyecto e informa documentos importados, en cola y fallidos',async()=>{
 const calls=[];const send=async(path,options)=>{calls.push([path,options]);if(path==='/api/projects/from-secop')return {project:{id:'p'}};if(path.endsWith('/2'))return {job:{id:'zip'}};if(path.endsWith('/3'))throw new Error('offline');return {file:{id:'f'}};};
 const result=await prepareOpportunity(send,{id:'op'},['1','2','3']);assert.equal(result.project.id,'p');assert.deepEqual(calls[0][1].json.documentIds,['1','2','3']);assert.deepEqual(result.imported,['1']);assert.deepEqual(result.queued,['2']);assert.deepEqual(result.failed,['3']);assert.deepEqual(calls.map(call=>call[0]),['/api/projects/from-secop','/api/projects/p/secop/imports/1','/api/projects/p/secop/imports/2','/api/projects/p/secop/imports/3']);
});
test('no importa si falla crear el proyecto y restringe documentos compatibles',async()=>{
 let count=0;await assert.rejects(prepareOpportunity(async()=>{count++;throw new Error('failed')},{id:'x'},['1']),/failed/);assert.equal(count,1);
 assert.equal(selectableDocument({id:'1',extension:'pdf',size:null}),true);assert.equal(selectableDocument({id:'2',extension:'zip',size:50*1024*1024}),true);assert.equal(selectableDocument({id:'3',extension:'exe',size:1}),false);assert.equal(selectableDocument({id:'4',extension:'pdf',size:50*1024*1024+1}),false);
});

test('selección masiva limita a 100 IDs únicos compatibles para que el servidor pueda crear el proyecto',()=>{
 const docs=Array.from({length:105},(_,i)=>({id:String(i+1),extension:'pdf',size:100}));
 const selected=selectLoadedDocuments([{id:'bad',extension:'pdf'},docs[0],...docs,{id:'200',extension:'exe'}]);
 assert.equal(selected.length,100);assert.equal(new Set(selected).size,100);assert.equal(selected[0],'1');assert.equal(selected[99],'100');
});
