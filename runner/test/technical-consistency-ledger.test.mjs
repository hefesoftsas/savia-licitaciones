import {test} from 'node:test';import assert from 'node:assert/strict';
const {validateConsistencyLedgerEntry,extractConsistencyLedger}=await import(process.env.SAVIA_TEST_LEDGER_MODULE||new URL('../technical-consistency-ledger.mjs',import.meta.url));
const chapter={id:'a',title:'Plazo',content:'El plazo previsto es de 15 días.'},reference={id:'r',title:'Referencia',content:'El plazo aprobado es de 20 días.'};
const facts={facts:[{category:'dates',subject:'plazo',value:'15 días',quote:'15 días'}],issues:[{description:'Difiere del plazo aprobado.',quote:'15 días'}]};
test('valida citas textuales y no permite atribuir incidencias a referencias de solo lectura',()=>{
 assert.deepEqual(validateConsistencyLedgerEntry(facts,chapter,false),facts);
 for(const invalid of [{...facts,facts:[{...facts.facts[0],quote:'99 días'}]},{...facts,facts:[{...facts.facts[0],category:'invented'}]},{...facts,issues:[{description:'Problema',quote:''}]}])assert.throws(()=>validateConsistencyLedgerEntry(invalid,chapter,false));
 assert.throws(()=>validateConsistencyLedgerEntry(facts,reference,true));
});
test('extrae cada capítulo por separado y entrega puntos de control sin modificar referencias',async()=>{
 const requests=[],checkpoints=[],runtime={runTask:async args=>{requests.push(args);const section=JSON.parse(args.files.find(file=>file.path==='section.json').content),value=section.reference?{facts:[{category:'dates',subject:'plazo',value:'20 días',quote:'20 días'}],issues:[]}:facts,validation=args.validateOutput({output_content:JSON.stringify(value)});assert.deepEqual(validation.issues,[]);return {validation_result:validation.value};}};
 const result=await extractConsistencyLedger({runtime,jobId:'job',language:'es',chapters:[{...chapter,private:'private-only'}],references:[reference],globalFacts:[{title:'Hecho'}],signal:new AbortController().signal,onSection:async entry=>checkpoints.push(entry)});
 assert.equal(requests.length,2);assert.deepEqual(result.map(item=>item.id),['a','r']);assert.equal(result[1].reference,true);assert.equal(checkpoints.length,2);assert.ok(requests.every(args=>args.files.some(file=>file.content.includes('Hecho'))));assert.ok(!requests[0].files.some(file=>file.content.includes(reference.content)));assert.ok(!JSON.stringify(requests[0].files).includes('private-only'));
});
test('reanuda solo hechos cuyos capítulos y hechos globales permanecen idénticos',async()=>{
 let calls=0;const runtime={runTask:async args=>{calls++;const valid=args.validateOutput({output_content:JSON.stringify(facts)});assert.deepEqual(valid.issues,[]);return {validation_result:valid.value};}},options={runtime,jobId:'job',language:'es',chapters:[chapter],globalFacts:[{title:'Hecho'}],signal:new AbortController().signal};
 const saved=await extractConsistencyLedger(options);assert.equal(calls,1);await extractConsistencyLedger({...options,savedEntries:saved});assert.equal(calls,1);
 await extractConsistencyLedger({...options,savedEntries:saved,globalFacts:[{title:'Otro hecho'}]});assert.equal(calls,2);
 const corrupted=saved.map(item=>({...item,facts:[{...item.facts[0],quote:'texto inexistente'}]}));await extractConsistencyLedger({...options,savedEntries:corrupted});assert.equal(calls,3);
});
test('detiene la extracción al cancelar y conserva solo puntos de control confirmados',async()=>{
 const controller=new AbortController(),saved=[];let calls=0;const runtime={runTask:async args=>{calls++;const valid=args.validateOutput({output_content:JSON.stringify(facts)});return {validation_result:valid.value};}};
 await assert.rejects(extractConsistencyLedger({runtime,jobId:'job',language:'es',chapters:[chapter,{...chapter,id:'b'}],signal:controller.signal,onSection:async entry=>{saved.push(entry);controller.abort();}}),{name:'AbortError'});assert.equal(calls,1);assert.deepEqual(saved.map(item=>item.id),['a']);
});
