import test from 'node:test';
import assert from 'node:assert/strict';
import { searchOpportunityCandidates } from '../src/opportunity-candidates.js';

test('consulta ambas fuentes, filtra procesos y prioriza coincidencias RUP', async () => {
 const calls=[];
 const searchProcesses=async query=>{ calls.push(query); return {success:true,data:{items:query.dataset==='secop-ii' && query.keyword ? [
  {id:'a',source:'secop-ii',title:'Sin clase',status:'Convocado'},
  {id:'b',source:'secop-ii',title:'Con clase',status:'Convocado',classificationCode:'V1.81112200',deadline:'2026-10-31',deadlineVerified:true},
  {id:'c',source:'secop-ii',title:'Vencido',status:'Convocado',deadline:'2026-10-30',deadlineVerified:true},
  {id:'d',source:'secop-ii',status:'Adjudicado'},
  {id:'e',source:'secop-ii',status:'Convocado',deadline:'2020-01-01',deadlineVerified:false},
 ]:query.dataset==='secop-i' && query.keyword ? [{id:'a',source:'secop-i',title:'Otra fuente',status:'Convocado'}]:[]}}; };
 const result=await searchOpportunityCandidates({profile:{reviewedRup:[{value:'81112200'}]},terms:['software'],searchProcesses,now:Date.parse('2026-11-01T02:00:00Z')});
 assert.deepEqual(calls.map(({dataset,keyword,classificationClass})=>[dataset,keyword||classificationClass]),[['secop-ii','software'],['secop-ii','811122'],['secop-i','software'],['secop-i','811122']]);
 assert.ok(calls.every(call=>call.fromDate==='2026-09-17'&&call.limit===50&&call.fresh===true));
 assert.deepEqual(result.shortlist.map(item=>item.id),['secop-ii:b','secop-ii:a','secop-ii:e','secop-i:a']);
 assert.equal(result.shortlist.find(item=>item.id==='secop-ii:e').deadline,undefined);
 assert.equal(result.candidates.length,4);
});

test('rechaza respuestas parciales y errores sin publicar una lista incompleta', async () => {
 for (const response of [{success:true,data:{items:[],partial:true}},{success:false,message:'falló'}, {success:true,data:{}}]) {
  await assert.rejects(searchOpportunityCandidates({profile:{reviewedRup:[]},terms:['obra'],searchProcesses:async()=>response,now:0}),/SECOP/);
 }
 await assert.rejects(searchOpportunityCandidates({profile:{reviewedRup:[]},terms:[],searchProcesses:async()=>{throw Error('no debe consultar');},now:0}),/fuentes|sources/i);
});

test('limita la captura, conserva identidad por fuente y no interpreta fechas inválidas', async () => {
 const rows=Array.from({length:70},(_,i)=>({id:String(i),source:'secop-ii',title:`Proceso ${i}`,status:'Convocado',deadline:'2026-02-31',deadlineVerified:true}));
 const result=await searchOpportunityCandidates({profile:{reviewedRup:[]},terms:['obra'],searchProcesses:async ({dataset})=>({success:true,data:{items:dataset==='secop-ii'?[...rows,rows[0]]:[]}}),now:Date.parse('2026-11-01T12:00:00Z')});
 assert.equal(result.shortlist.length,60);
 assert.equal(result.candidates.length,60);
 assert.equal(result.candidates[0].id,'secop-ii:0');
});

test('solo muestra procesos abiertos y descarta los que ya cerraron', async () => {
 const {isOpenOpportunity}=await import('../src/opportunity-candidates.js');
 const now=Date.parse('2026-11-10T18:00:00Z');
 for(const status of ['Evaluación','Borrador','Cerrado','Adjudicado','Cancelado','']) assert.equal(isOpenOpportunity({source:'secop-ii',status},now),false,status);
 assert.equal(isOpenOpportunity({source:'secop-ii',status:'Publicado',phase:'Evaluación'},now),false);
 assert.equal(isOpenOpportunity({source:'secop-ii',status:'Publicado',deadline:'2026-11-09',deadlineVerified:true},now),false);
 assert.equal(isOpenOpportunity({source:'secop-ii',status:'Publicado',deadline:'2026-11-10',deadlineVerified:true},now),true);
 assert.equal(isOpenOpportunity({source:'secop-ii',status:'Publicado',deadline:'2026-11-10T12:00:00',deadlineVerified:true},now),false);
 assert.equal(isOpenOpportunity({source:'secop-ii',status:'Publicado',deadline:'2026-11-10T15:00:00',deadlineVerified:true},now),true);
 assert.equal(isOpenOpportunity({source:'secop-i',status:'Convocado'},now),true);
 assert.equal(isOpenOpportunity({source:'placsp',status:'Publicado',statusCode:'PUB',deadline:'2026-11-10T19:30:00',deadlineVerified:true},now),true);
 assert.equal(isOpenOpportunity({source:'placsp',status:'Publicado',statusCode:'PUB',deadline:'2026-11-10T18:30:00',deadlineVerified:true},now),false);
 assert.equal(isOpenOpportunity({source:'placsp',status:'Evaluación',statusCode:'EV'},now),false);
});

test('soporta market ES y ALL con PLACSP, CPV y EUR', async () => {
 const calls=[];
 const searchProcesses=async query=>{
  calls.push(query.dataset);
  if(query.dataset==='placsp' && query.keyword==='cloud'){
   return {success:true,data:{items:[{id:'p1',source:'placsp',country:'ES',title:'Nube pública',status:'Publicado',statusCode:'PUB',classificationCode:'72000000',value:90000,currency:'EUR',currencyVerified:true,deadline:'2026-12-01',deadlineVerified:true}]}};
  }
  return {success:true,data:{items:[]}};
 };
 const esOnly=await searchOpportunityCandidates({profile:{reviewedRup:[],cpvCodes:['72000000']},terms:['cloud'],searchProcesses,now:Date.parse('2026-11-01T12:00:00Z'),market:'ES'});
 assert.ok(calls.every(d=>d==='placsp'));
 assert.equal(esOnly.shortlist.length,1);
 assert.equal(esOnly.shortlist[0].currency,'EUR');
});

test('actualiza el estado antes de mostrar recomendaciones y oculta las que no pudo verificar', async () => {
 const {refreshOpportunityStatuses}=await import('../src/opportunity-candidates.js');
 const items=['open','closed','error'].map(id=>({id:`secop-ii:${id}`,process:{id,source:'secop-ii',status:'Publicado'},reviewed:false}));
 const result=await refreshOpportunityStatuses(items,async process=>process.id==='error'?{success:false}: {success:true,data:{...process,status:process.id==='closed'?'Adjudicado':'Publicado'}});
 assert.deepEqual(result.items.map(item=>item.id),['secop-ii:open']);
 assert.equal(result.verificationUnavailable,true);
});
