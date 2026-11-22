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
 assert.equal(isOpenOpportunity({source:'ted',status:'Publicado',statusCode:'PUB',deadline:'2026-11-10T19:30:00',deadlineVerified:true},now),true);
 assert.equal(isOpenOpportunity({source:'ted',status:'Publicado',statusCode:'PUB',deadline:'2026-11-10T18:30:00',deadlineVerified:true},now),false);
 assert.equal(isOpenOpportunity({source:'ted',status:'Adjudicado',statusCode:'ADJ'},now),false);
});

test('soporta market ES y ALL con PLACSP, TED, CPV y EUR deduplicando candidatos', async () => {
 const calls=[];
 const searchProcesses=async query=>{
  calls.push(query);
  if(query.dataset==='placsp' && query.keyword==='cloud'){
   return {success:true,data:{items:[
    {id:'p1',source:'placsp',country:'ES',reference:'EXP-PLACSP-1',entity:'Ministerio A',title:'Nube pública',status:'Publicado',statusCode:'PUB',classificationCode:'72000000',value:90000,currency:'EUR',currencyVerified:true,deadline:'2026-12-01',deadlineVerified:true,url:'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=SAME1'},
   ]}};
  }
  if(query.dataset==='ted' && query.keyword==='cloud'){
   return {success:true,data:{items:[
    {id:'ted:700-2026',source:'ted',country:'ES',reference:'TED-DUP-URL',entity:'Otro',title:'Duplicado URL',status:'Publicado',statusCode:'PUB',classificationCode:'72000000',value:90000,currency:'EUR',currencyVerified:true,deadline:'2026-12-01T12:00:00',deadlineVerified:true,portalUrl:'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=SAME1'},
    {id:'ted:701-2026',source:'ted',country:'ES',reference:'EXP-PLACSP-1',entity:'Ministerio A',title:'Duplicado ref+entidad',status:'Publicado',statusCode:'PUB',classificationCode:'72000000',value:90000,currency:'EUR',currencyVerified:true,deadline:'2026-12-01T12:00:00',deadlineVerified:true},
    {id:'ted:70899-2026',source:'ted',country:'ES',reference:'URA/001/2026',entity:'Agencia Vasca del Agua',title:'Hidrología País Vasco',status:'Publicado',statusCode:'PUB',classificationCode:'71311100',value:500000,currency:'EUR',currencyVerified:true,deadline:'2026-12-31T12:00:00',deadlineVerified:true},
   ]}};
  }
  return {success:true,data:{items:[]}};
 };
 const esOnly=await searchOpportunityCandidates({profile:{reviewedRup:[],cpvCodes:['72200000']},terms:['cloud'],searchProcesses,now:Date.parse('2026-11-01T12:00:00Z'),market:'ES'});
 assert.ok(calls.every(c=>(c.dataset==='placsp'||c.dataset==='ted') && c.openOnly===true));
 assert.ok(calls.some(c=>c.dataset==='placsp'));
 assert.ok(calls.some(c=>c.dataset==='ted'));
 assert.ok(calls.some(c=>c.classificationClass==='72200000'));
 assert.deepEqual(esOnly.shortlist.map(i=>i.id).sort(),['placsp:p1','ted:ted:70899-2026']);
 assert.equal(esOnly.shortlist.find(i=>i.id==='placsp:p1').currency,'EUR');
 assert.equal(esOnly.shortlist.find(i=>i.id==='ted:ted:70899-2026').deadline,'2026-12-31T12:00:00');
});

test('actualiza el estado antes de mostrar recomendaciones y oculta las que no pudo verificar', async () => {
 const {refreshOpportunityStatuses}=await import('../src/opportunity-candidates.js');
 const items=['open','closed','error'].map(id=>({id:`secop-ii:${id}`,process:{id,source:'secop-ii',status:'Publicado'},reviewed:false}));
 const result=await refreshOpportunityStatuses(items,async process=>process.id==='error'?{success:false}: {success:true,data:{...process,status:process.id==='closed'?'Adjudicado':'Publicado'}});
 assert.deepEqual(result.items.map(item=>item.id),['secop-ii:open']);
 assert.equal(result.verificationUnavailable,true);
});

test('conserva los criterios oficiales cuando PLACSP ya devolvió el mismo anuncio TED', async () => {
 const notice = {source:'ted',id:'ted:762248-2026',status:'Publicado',reference:'FP.499.080/0611'};
 const official = {...notice,selectionCriteria:'Cifra anual de negocio',awardCriteria:'Experiencia adicional'};
 const result = await searchOpportunityCandidates({
  profile:{},terms:['Casella-Barxeta'],market:'ES',
  searchProcesses:async ({dataset}) => ({success:true,data:{items:[dataset==='ted' ? official : notice]}}),
 });
 assert.equal(result.shortlist.length,1);
 assert.equal(result.shortlist[0].selectionCriteria,official.selectionCriteria);
 assert.equal(result.shortlist[0].awardCriteria,official.awardCriteria);
 assert.equal(result.candidates[0].process.selectionCriteria,official.selectionCriteria);
});
