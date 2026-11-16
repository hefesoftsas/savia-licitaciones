import {applyBatchAdvice} from './word-batch-assistance.mjs';
export function makeTestAnswers(fields,en){return fields.map((_,id)=>({id,proposal:en?`TEST DATA ${id+1}`:`DATO FICTICIO DE PRUEBA ${id+1}`}));}
export function applyTestAnswers(editor,fields,apply=applyBatchAdvice,en=false){
 const result=apply(editor,fields,makeTestAnswers(fields,en),0,0);
 if(result.stale||result.failed||result.applied!==fields.length)throw new Error('test_copy_incomplete');
 return result.applied;
}
