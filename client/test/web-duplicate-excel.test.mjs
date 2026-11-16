import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../package.json',import.meta.url));
const XLSX=require('xlsx');
const {buildDuplicateExcel}=await import('../src/features/web/duplicate-excel.mjs');

test('exporta las seis secciones con contenido literal y ubicaciones recuperables',()=>{
 const sentence='=HYPERLINK("https://example.com")',long='x'.repeat(33000);
 const report={status:'success',metadataAnalysis:{status:'success',rows:[{key:'author',label:'Autor',values:{a:'Empresa A',b:'Empresa B'},duplicate_file_ids:['a','b'],same_day_file_ids:[]}]},outlineAnalysis:{status:'success',tenderMatchedItemCount:2,duplicateGroups:[{title:'Plan',type:'duplicate',score:0.9,file_ids:['a','b'],paths:{a:['Plan / diseño'],b:['Plan']}}],pairwiseSimilarities:[{file_a_id:'a',file_b_id:'b',score:0.9,title_overlap:0.8,path_overlap:0.7,order_similarity:0.6,shared_count:2,risk:'high'}]},contentAnalysis:{status:'success',tenderMatchedSentenceCount:1,totalSentenceCount:20,duplicateSentences:[{sentence,file_ids:['a','b'],occurrences:{a:2,b:1}},{sentence:long,file_ids:['a'],occurrences:{a:1}}]},imageAnalysis:{status:'success',totalImageCount:2,duplicateImages:[{hash:'abc',file_ids:['a'],occurrences:{a:2},locations:{a:[{image_index:3,directory:'Capítulo 1',previous_sentence:'Antes de la imagen'}]}}]}};
 const files=[{id:'a',name:'Oferta A.docx'},{id:'b',name:'Oferta B.docx'}],book=XLSX.read(buildDuplicateExcel(report,{language:'es',files,bidFileIds:['a','b'],tenderFileIds:[]}),{type:'array',cellNF:true});
 assert.deepEqual(book.SheetNames,['Resumen de duplicados','Metadatos','Estructura duplicada','Similitud de archivos','Frases duplicadas','Imágenes duplicadas']);
 const rows=name=>XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:''});
 assert.equal(rows('Frases duplicadas')[1][1],sentence);assert.equal(book.Sheets['Frases duplicadas'].B2.f,undefined);assert.match(rows('Frases duplicadas')[2][1],/truncado/);
 assert.match(rows('Imágenes duplicadas')[1][4],/Capítulo 1/);assert.match(rows('Imágenes duplicadas')[1][5],/Antes de la imagen/);
 assert.equal(rows('Similitud de archivos')[1][2],0.9);assert.match(rows('Metadatos')[1].join(' '),/Oferta A.docx/);
 assert.equal(book.Sheets['Similitud de archivos'].C2.z,'0.00%');assert.equal(book.Sheets['Estructura duplicada'].D2.z,'0.00%');
 const english=XLSX.read(buildDuplicateExcel(report,{language:'en',files,bidFileIds:['a','b'],tenderFileIds:[]}),{type:'array'});
 assert.deepEqual(english.SheetNames,['Review summary','Metadata','Outline matches','File similarity','Repeated sentences','Matching images']);
 assert.equal(XLSX.utils.sheet_to_json(english.Sheets['Repeated sentences'],{header:1})[1][1],sentence);
 const withoutProjectFiles=XLSX.read(buildDuplicateExcel({...report,sourceFiles:files},{language:'es',files:[],bidFileIds:['a','b']}),{type:'array'});
 assert.match(XLSX.utils.sheet_to_json(withoutProjectFiles.Sheets['Frases duplicadas'],{header:1})[1][2],/Oferta A.docx/);
});
