import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url)),XLSX=require('xlsx');
const {buildRejectionExcel}=await import('../src/features/web/rejection-excel.mjs');

test('exporta las revisiones visibles y los errores sin convertir texto en fórmulas',()=>{
 const report={sourceFiles:[{id:'a',name:'Oferta A.docx'}],rejectionCheckResult:{status:'success',removedCount:2,findings:[{bidDocumentId:'a',type:'invalidBid',severity:'high',title:'=1+1',requirement:'Requisito',bidEvidence:'Evidencia',riskReason:'Riesgo',suggestion:'x'.repeat(33000)}]},typoCheckResult:{status:'success',findings:[{bidDocumentId:'a',wrongText:'experiensia',correctText:'experiencia',originalExcerpt:'Texto original'}]},logicCheckResult:{status:'error',findings:[]}};
 const bytes=buildRejectionExcel(report,{language:'es',files:[],bidFileIds:['a']}),book=XLSX.read(bytes,{type:'array'}),rows=name=>XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:''});
 assert.deepEqual(book.SheetNames,['Resumen de revisión','Causales de rechazo','Errores ortográficos','Problemas de lógica']);
 assert.equal(rows('Causales de rechazo')[1][2],'Oferta A.docx');assert.equal(rows('Causales de rechazo')[1][5],'=1+1');assert.equal(book.Sheets['Causales de rechazo'].F2.f,undefined);assert.match(rows('Causales de rechazo')[1][10],/truncado/);assert.match(rows('Resumen de revisión').flat().join(' '),/Fall/);
 assert.equal(rows('Resumen de revisión')[1][3],2);
 const english=XLSX.read(buildRejectionExcel(report,{language:'en',files:[],bidFileIds:['a']}),{type:'array'});assert.deepEqual(english.SheetNames,['Review summary','Rejection risks','Spelling','Logic']);assert.equal(XLSX.utils.sheet_to_json(english.Sheets.Spelling,{header:1})[1][3],'experiensia');
});
