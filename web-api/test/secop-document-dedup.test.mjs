import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deduplicateSecopDocuments} from '../src/secop-document-dedup.js';

test('deduplica IDs distintos solo si coinciden los bytes y conserva la primera aparición',async()=>{
  const files = new Map([['1','%PDF-aa'],['2','%PDF-bb'],['3','%PDF-aa'],['4','<html/>'],['5','%PDF-bb']]);
  const original=globalThis.fetch, calls=[];
  globalThis.fetch=async url=>{
    assert.equal(url.hostname,'community.secop.gov.co');
    const id=url.searchParams.get('DocumentId');
    calls.push(id);
    return new Response(files.get(id),{headers:{'content-type':id==='4'?'text/html':'application/pdf'}});
  };
  try {
    const items=[1,2,3,4,5,6].map(id=>({id:String(id),name:id===6?'Único.pdf':id===3?'Acta renombrada.pdf':'Acta.pdf',size:id===6?9:7}));
    assert.deepEqual((await deduplicateSecopDocuments(items)).map(x=>x.id),['1','2','4','6']);
    assert.deepEqual(calls.sort(),['1','2','3','4','5']);
  } finally {globalThis.fetch=original;}
});
