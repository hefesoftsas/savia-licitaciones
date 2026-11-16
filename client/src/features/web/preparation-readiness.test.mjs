import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasPendingFacts,incompleteChapters} from './preparation-readiness.mjs';
import {preparationProgress,preparationBlocker} from './preparation-progress.mjs';
test('un nuevo intento de índice no bloquea un índice ya aplicado',()=>{
 const state={selectedFiles:['a'],analyses:['project-overview','technical-score','response-requirements'].map(category=>({category,current:true})),plan:{outline:[{content:''}]},jobs:[{kind:'technical-plan.generate-roots',state:'running'}]};
 assert.equal(preparationBlocker(2,state,state.selectedFiles),null);
 assert.equal(preparationProgress(state).states[2],'complete');
 state.plan.outline=[];
 assert.equal(preparationBlocker(2,state,state.selectedFiles),'outline');
});
test('detecta los reemplazos pendientes en español y marcadores heredados',()=>{
 for(const value of ['Plazo: [Pendiente por completar]','[Pendiente por confirmar]','【待填写】','[Pending completion]']) assert.equal(hasPendingFacts(value),true);
 assert.equal(hasPendingFacts('Plazo: cinco meses.'),false);
});
test('la entrega requiere contenido guardado en cada capítulo final',()=>{
 const nodes=[{id:'parent',content:'',children:[{id:'empty',content:''},{id:'pending',content:'Plazo: [Pendiente por completar]'},{id:'ready',content:'Cinco meses.'}]}];
 assert.deepEqual(incompleteChapters(nodes).map(n=>n.id),['empty','pending']);
});
test('confirmar hechos con marcadores no completa el paso ni permite dar la redacción por terminada',()=>{
 const state={selectedFiles:['a'],analyses:['project-overview','technical-score','response-requirements'].map(category=>({category,current:true})),plan:{outline:[{content:'Texto listo'}]},facts:{current:true,revision:1,groups:[{title:'Plazo',content:'[Pendiente por completar]'}]}};
 assert.equal(preparationProgress(state).resume,3);
 state.facts.groups[0].content='Cinco meses';
 assert.equal(preparationProgress(state).states[3],'complete');
});

test('localiza cada pendiente, incluidos varios dentro del mismo apartado y en títulos',async()=>{
 const {pendingFactLocations}=await import('./preparation-readiness.mjs');
 const groups=[{id:'a',title:'Título [Pendiente por confirmar]',content:'📄 Equipo: [Pendiente por completar]. Sede: [Pendiente por completar].'},{id:'b',title:'Plazo',content:'【待填写】'}];
 const found=pendingFactLocations(groups);
 assert.deepEqual(found.map(item=>[item.groupId,item.field]),[['a','title'],['a','content'],['a','content'],['b','content']]);
 for(const location of found){const group=groups.find(g=>g.id===location.groupId);assert.equal(hasPendingFacts(group[location.field].slice(location.start,location.end)),true);}
 groups[0].content=groups[0].content.replace('[Pendiente por completar]','Dos computadores');
 assert.equal(pendingFactLocations(groups).length,3);
});
