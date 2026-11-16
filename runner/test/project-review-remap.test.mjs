import {test} from 'node:test';
import assert from 'node:assert/strict';
import {remapReviewReport,remapReviewPayload,remapReviewResult} from '../project-review-remap.mjs';

test('remapea solo campos de documentos en duplicados y conserva el texto literal',()=>{
 const map=new Map([['a','new-a'],['b','new-b']]),report={sourceFiles:[{id:'a',name:'a'}],metadataAnalysis:{files:[{file_id:'a',file_name:'a'}],contentFiles:[{file_id:'b'}],rows:[{values:{a:'a',b:'texto'},duplicate_file_ids:['a','b'],same_day_file_ids:['a']}]},outlineAnalysis:{files:[{file_id:'a'}],duplicateGroups:[{title:'a',file_ids:['a'],paths:{a:['a']},item_ids:{a:['item-a']}}],pairwiseSimilarities:[{file_a_id:'a',file_b_id:'b'}]},contentAnalysis:{duplicateSentences:[{sentence:'a',file_ids:['a'],occurrences:{a:2}}]},imageAnalysis:{files:[{file_id:'b'}],duplicateImages:[{file_ids:['b'],occurrences:{b:3},locations:{b:[{directory:'a'}]}}]},previews:[{id:'a',base64:'texto'}]};
 const output=remapReviewReport('duplicate-check.analyze',report,map);
 assert.equal(output.sourceFiles[0].id,'new-a');assert.equal(output.sourceFiles[0].name,'a');assert.deepEqual(output.metadataAnalysis.rows[0].values,{'new-a':'a','new-b':'texto'});assert.deepEqual(output.metadataAnalysis.rows[0].duplicate_file_ids,['new-a','new-b']);
 assert.deepEqual(output.outlineAnalysis.duplicateGroups[0].paths,{'new-a':['a']});assert.equal(output.outlineAnalysis.pairwiseSimilarities[0].file_b_id,'new-b');assert.equal(output.contentAnalysis.duplicateSentences[0].sentence,'a');assert.deepEqual(output.contentAnalysis.duplicateSentences[0].occurrences,{'new-a':2});assert.deepEqual(output.imageAnalysis.duplicateImages[0].locations,{'new-b':[{directory:'a'}]});assert.equal(output.previews[0].id,'a');assert.equal(report.sourceFiles[0].id,'a');
 assert.equal(output.metadataAnalysis.files[0].file_id,'new-a');assert.equal(output.metadataAnalysis.contentFiles[0].file_id,'new-b');assert.equal(output.outlineAnalysis.files[0].file_id,'new-a');assert.deepEqual(output.outlineAnalysis.duplicateGroups[0].item_ids,{'new-a':['item-a']});assert.equal(output.imageAnalysis.files[0].file_id,'new-b');
});
test('remapea hallazgos y selecciones y conserva documentos ausentes como referencias no disponibles',()=>{
 const map=new Map([['a','new-a']]),report={sourceFiles:[{id:'a',name:'Pliego'},{id:'missing',name:'Oferta'}],rejectionCheckResult:{findings:[{id:'a',bidDocumentId:'missing',title:'a'}]},typoCheckResult:{findings:[{bidDocumentId:'a',wrongText:'a'}]}};
 const output=remapReviewReport('rejection-check.analyze',report,map);assert.equal(output.sourceFiles[1].id,'missing:missing');assert.equal(output.rejectionCheckResult.findings[0].bidDocumentId,'missing:missing');assert.equal(output.rejectionCheckResult.findings[0].id,'a');assert.equal(output.typoCheckResult.findings[0].wrongText,'a');
 assert.deepEqual(remapReviewPayload({fileIds:['a','missing'],tenderFileIds:['a'],bidFileIds:['missing'],criteria:'a'},map),{fileIds:['new-a','missing:missing'],tenderFileIds:['new-a'],bidFileIds:['missing:missing'],criteria:'a'});
 assert.deepEqual(remapReviewResult({criteria:'a',sourceFiles:[{id:'a',name:'a'}],artifactId:'old'},map,'artifact-new'),{criteria:'a',sourceFiles:[{id:'new-a',name:'a'}],artifactId:'artifact-new'});
});
