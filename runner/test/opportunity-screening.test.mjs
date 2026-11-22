import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {screenOpportunity} from '../opportunity-screening.mjs';

const require=createRequire(new URL('../../client/package.json',import.meta.url));
const xlsx=require('xlsx');
const candidate={id:'ted:762248-2026',selectionCriteria:'Cifra anual de negocio'};
const preliminary={id:candidate.id,reason:'Servicios de ingeniería',checks:'Revisar los pliegos'};
const document={id:'rates',name:'Anexo de precios.xlsx',extension:'xlsx',url:'https://contrataciondelestado.es/precios.xlsx'};

test('contrasta un anexo de precios real con las referencias declaradas por la empresa',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'screen-tender-'));
  try {
    const book=xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet([['Unidad','EUR/km'],['Medición',950]]),'Tarifas');
    const profile={bidBenchmarks:'Coste de medición: 850 EUR/km'};
    const result=await screenOpportunity({
      candidate,preliminary,profile,directory,language:'es',app:{isPackaged:false,getPath:()=>directory},
      config:{components:{file_parser:{provider:'local'}}},
      context:{getOpportunityDocuments:async(id)=>{assert.equal(id,candidate.id);return {documents:[document]};}},
      fetchImpl:async(url,options)=>{
        assert.equal(url,document.url);
        assert.equal(options.credentials,'omit');
        return new Response(xlsx.write(book,{type:'buffer',bookType:'xlsx'}),{headers:{'content-type':'application/octet-stream'}});
      },
      runtime:{runTask:async task=>{
        const input=JSON.parse(task.files[0].content);
        assert.deepEqual(input.profile,profile);
        assert.equal(input.sources[0].name,document.name);
        assert.match(task.files[1].content,/950/);
        return {assistant_text:JSON.stringify({verdict:'review',reason:'Anexo de precios: 950 EUR/km.',checks:'Confirmar facturación del ejercicio.'})};
      }},
    });
    assert.equal(result.id,candidate.id);
    assert.match(result.reason,/950 EUR\/km/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('una descarga rechazada conserva la oportunidad para revisión',async()=>{
  const result=await screenOpportunity({candidate:{id:preliminary.id},preliminary,language:'es',
    context:{getOpportunityDocuments:async()=>({documents:[document]})},fetchImpl:async()=>new Response(null,{status:403})});
  assert.equal(result.verdict,'review');
  assert.match(result.checks,/pliegos/);
});

test('la preselección TED de OpenCode Go consulta el expediente antes de devolver el dictamen',async()=>{
  const {createOpportunityAnalysisHandler}=await import('../opportunity-analysis.mjs');
  const calls=[];
  const runtime={
    runTask:async task=>{
      calls.push(task.initial_stage);
      if(task.initial_stage==='opportunity-suggestions')return {assistant_text:JSON.stringify([preliminary])};
      const input=JSON.parse(task.files[0].content);
      assert.equal(input.candidate.selectionCriteria,candidate.selectionCriteria);
      assert.equal(input.profile.bidBenchmarks,'2025: 400000 EUR');
      return {assistant_text:JSON.stringify({verdict:'pursue',reason:'TED exige cifra anual de negocio.',checks:'Confirmar el importe en el PCAP.'})};
    },
    close:async()=>{},
  };
  const handler=createOpportunityAnalysisHandler({createRuntime:()=>runtime,createAiService:()=>({})});
  const result=await handler({language:'es',dataProcessingConsent:true},{
    getCredential:async()=>({provider:'opencode-go',model:'fixture',secret:'fixture'}),
    getOpportunitySources:async()=>({shortlist:[candidate],profile:{bidBenchmarks:'2025: 400000 EUR'}}),
    getOpportunityDocuments:async id=>{assert.equal(id,candidate.id);return {documents:[]};},
    assertOpportunitySources:async()=>{},
  });
  assert.deepEqual(calls,['opportunity-suggestions','opportunity-screening']);
  assert.equal(result.recommendations[0].verdict,'review');
  assert.match(result.recommendations[0].checks,/PCAP/);
});
