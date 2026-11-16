import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateProjectComparisons} from '../project-comparison-restore.mjs';
const snapshot={factId:'f',label:'Indicador',value:'1',page:1,title:'Requisito',source:'pliego',operator:'>=',threshold:'1',interpretedValue:'1',documentsHash:'hash',updatedAt:'2026',certificateName:'rup.pdf',issuedOn:'2026'};
test('rechaza referencias, campos y fuentes no recuperables antes de crear el proyecto',()=>{
 const workflow={requirements:[{id:'r'}]},objects=new Map(),item={id:'c',requirementId:'r',snapshot,missingReason:'not_found',source:null};
 assert.equal(validateProjectComparisons([item],workflow,objects).size,0);
 for(const invalid of [{...item,requirementId:'missing'},{...item,snapshot:{...snapshot,unknown:'data'}},{...item,source:undefined},{...item,source:{size:1},missingReason:null}])assert.throws(()=>validateProjectComparisons([invalid],workflow,objects),/comparaciones/i);
 assert.throws(()=>validateProjectComparisons([item,item],workflow,objects),/comparaciones/i);
 const oversized=25*1024*1024+1;
 assert.throws(()=>validateProjectComparisons([{...item,source:{size:oversized},missingReason:null}],workflow,new Map([['comparison:c',{size:oversized}]])),/comparaciones/i);
});
