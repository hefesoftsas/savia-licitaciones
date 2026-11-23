import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flattenExpanded} from '../src/technical-outline.js';
const root={id:'efe6f68b-c909-4687-a0e2-b59c7fa0fff3',title:'Oferta económica',description:'Carta y precio',attr:'报价',content_mode:'ai-generate'};
test('confirmed leaf mode wins over desktop category defaults',()=>{
 const result=flattenExpanded([{...root,content_mode:'manual-fill'}],[root]);
 assert.equal(result[0].mode,'ai-generate');
 assert.equal(result[0].id,root.id);
});
test('mode recovery does not permit changes to selected chapter identity',()=>{
 assert.equal(flattenExpanded([{...root,title:'Otro capítulo'}],[root]),null);
 assert.equal(flattenExpanded([{...root,attr:'技术'}],[root]),null);
 assert.equal(flattenExpanded([{...root,content_mode:'unknown'}],[root]),null);
});
test('reorders valid root chapters back to confirmed selection order',()=>{
 const rootA={id:'11111111-1111-4111-8111-111111111111',title:'Catálogo',description:'Catálogo técnico',attr:'技术',content_mode:'ai-generate'};
 const rootB={id:'22222222-2222-4222-8222-222222222222',title:'Mejora',description:'Propuesta de mejora',attr:'技术',content_mode:'ai-generate'};
 const child1={id:'33333333-3333-4333-8333-333333333333',title:'Diseño',description:'Detalle diseño',content_mode:'ai-generate'};
 const child2={id:'44444444-4444-4444-8444-444444444444',title:'Instalación',description:'Detalle instalación',content_mode:'ai-generate'};
 const result=flattenExpanded([{...rootB,children:[child1,child2]},rootA],[rootA,rootB]);
 assert.deepEqual(result.map(({id,parent,order})=>({id,parent,order})),[
  {id:rootA.id,parent:null,order:0},
  {id:rootB.id,parent:null,order:1},
  {id:child1.id,parent:rootB.id,order:0},
  {id:child2.id,parent:rootB.id,order:1},
 ]);
 assert.equal(flattenExpanded([rootA,{...rootB,id:'55555555-5555-4555-8555-555555555555'}],[rootA,rootB]),null);
 assert.equal(flattenExpanded([rootA,rootA],[rootA,rootB]),null);
});
