import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectPendingFields} from '../src/features/web/word-pending-fields.mjs';
function search(paragraphs){return {findMatches(query){return paragraphs.flatMap((text,paragraphIndex)=>[...text.matchAll(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'))].map(match=>({blockId:`p${paragraphIndex}`,paragraphIndex,start:match.index,length:match[0].length,text:match[0],runIndex:0,runOffset:match.index})));}};}
test('finds complete markers in document order, includes variants and ignores quotations',()=>{
 const paragraphs=['Empresa [POR DEFINIR — nombre completo] y [Pendiente por completar].','Texto citado […] y [...].','Firma: [Firma].','Dato [POR DEFINIR: mínimo exigido].'];
 const fields=collectPendingFields(search(paragraphs));
 assert.deepEqual(fields.map(f=>paragraphs[f.paragraphIndex].slice(f.start,f.start+f.length)),['[POR DEFINIR — nombre completo]','[Pendiente por completar]','[Firma]','[POR DEFINIR: mínimo exigido]']);
});
test('does not depend on visible pages; rescans after edits and undo',()=>{
 const paragraphs=Array.from({length:649},(_,i)=>i%3===0?'Dato [POR DEFINIR]':'Texto completo');
 assert.equal(collectPendingFields(search(paragraphs)).length,217);
 paragraphs[648]='Dato confirmado';assert.equal(collectPendingFields(search(paragraphs)).length,216);
 paragraphs[648]='Dato [POR DEFINIR]';assert.equal(collectPendingFields(search(paragraphs)).length,217);
});
test('preserves the semantic position for table cells and split runs',()=>{
 const match={blockId:'table-cell-p',paragraphIndex:25,start:9,length:12,runIndex:3,runOffset:2,text:'[POR DEFINIR'};
 const fields=collectPendingFields({findMatches:q=>q==='[POR DEFINIR'?[match]:q===']'?[{...match,start:45,length:1}]:[]});
 assert.deepEqual(fields,[{...match,length:37}]);
});
test('finished document has no pending fields',()=>assert.deepEqual(collectPendingFields(search(['Datos confirmados y cita […]'])),[]));
test('next and previous work after completing a field and wrap at document edges',async()=>{
 const {pendingFieldIndex}=await import('../src/features/web/word-pending-fields.mjs');
 const fields=collectPendingFields(search(['[POR DEFINIR]','[POR DEFINIR]','[POR DEFINIR]']));
 assert.equal(pendingFieldIndex(fields,null,-1),2);
 assert.equal(pendingFieldIndex(fields,fields[2],1),0);
 const remaining=[fields[0],fields[2]];
 assert.equal(pendingFieldIndex(remaining,fields[1],1),1);
 assert.equal(pendingFieldIndex(remaining,fields[1],-1),0);
 assert.equal(pendingFieldIndex([],fields[1],1),-1);
});
