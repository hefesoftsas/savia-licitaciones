import test from 'node:test';
import assert from 'node:assert/strict';
import {createWordExportHandler} from '../technical-plan-export.mjs';

test('exports only the technical roots and rejects a rendered Word above the pliego limit', async () => {
  const outline = [
    {id:'technical',title:'Metodología',number:'2',attr:'技术',content:'Método'},
    {id:'commercial',title:'Precio ofertado',number:'3',attr:'报价',content:'99 EUR'},
  ];
  const context = {
    getPlanContext:async()=>({outline,hasTemplate:true}),
    uploadArtifact:async()=>assert.fail('The oversized document must not be published'),
  };
  const handler = createWordExportHandler({
    convert:async ({outline:nodes,hasTemplate})=>{
      assert.deepEqual(nodes.map(({id,number})=>[id,number]),[['technical','1']]);
      assert.equal(hasTemplate,false);
      return {bytes:Buffer.from('word'),warnings:[]};
    },
    measurePages:async()=>26,
  });
  await assert.rejects(handler({language:'es',bidDocument:'technical',pageLimit:25},context), /26.*25/);
});

test('extracts only the official annex pages and ignores the contents page', async () => {
  const {createRequire}=await import('node:module');
  const client=createRequire(new URL('../../client/package.json',import.meta.url));
  const {PDFDocument}=client('pdf-lib');
  const {extractEconomicAnnex}=await import('../bid-document-export.mjs');
  const original=await PDFDocument.create();
  const text=[
    ['ANNEX 5 ........................ 4','ANNEX 6 ........................ 6'],
    ['ANNEX 4','MEMORIA TÉCNICA'],
    ['ANNEX 5','MODEL DE PROPOSTA ECONÒMICA'],
    ['Continuació del formulari'],
    ['ANNEX 6','CRITERIS D’ADJUDICACIÓ'],
  ];
  for (const [index,lines] of text.entries()) {
    original.addPage([560+index,800]).drawText(lines.join('\n'),{x:60,y:720,size:14,lineHeight:22});
  }
  const source=await original.save();
  // Warm the PDF worker with the parser used earlier in the same runner process.
  const {PDFParse}=client('pdf-parse');
  const parser=new PDFParse({data:new Uint8Array(source)});
  try { await parser.getText(); } finally { await parser.destroy(); }
  const result=await extractEconomicAnnex({language:'es',fileIds:['pcap'],economicAnnex:5},{
    getFileStream:async()=>({name:'PCAP.pdf',bytes:source}),
  });
  const annex=await PDFDocument.load(result.bytes);
  assert.equal(result.pageCount,2);
  assert.deepEqual(annex.getPages().map(page=>page.getWidth()),[562,563]);
});
