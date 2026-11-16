import{test}from'node:test';import assert from'node:assert/strict';import{preparationProgress as progress,preparationBlocker}from'../../client/src/features/web/preparation-progress.mjs';
const analyses=['project-overview','technical-score','response-requirements'].map(category=>({category,current:true}));
test('resume follows actual accepted/saved results and source invalidation',()=>{assert.equal(progress({}).resume,0);assert.equal(progress({selectedFiles:['f']}).resume,1);assert.equal(progress({selectedFiles:['f'],analyses}).resume,2);const base={selectedFiles:['f'],analyses,plan:{version:4,outline:[{content:'',children:[]}]}};assert.equal(progress(base).resume,3);assert.equal(progress({...base,facts:{current:true,revision:1}}).resume,4);const drafted={...base,facts:{current:true,revision:1},plan:{version:4,outline:[{content:'saved',children:[]}]}};assert.equal(progress(drafted).resume,5);assert.equal(progress({...drafted,jobs:[{kind:'technical-plan.export-word',state:'succeeded',artifactState:'stored',payload:{planVersion:4}}]}).states[5],'complete');assert.equal(progress({...drafted,jobs:[{kind:'technical-plan.export-word',state:'succeeded',artifactState:'stored',payload:{planVersion:3}}]}).states[5],'current');assert.equal(progress({...drafted,analyses:[{category:'project-overview',current:false}]}).resume,1);});
test('active runner task wins without marking navigation as completion',()=>{const value=progress({selectedFiles:['f'],jobs:[{kind:'technical-plan.generate-roots',state:'running'}]});assert.equal(value.resume,2);assert.equal(value.states[2],'running');assert.equal(value.states[1],'pending');});

test('explains the difference between drafts, missing values and completed chapters',()=>{
 const snapshot={analyses,facts:{current:true,revision:1},plan:{outline:[{content:''}]}};
 assert.equal(preparationBlocker(4,snapshot,['f']),'drafts');
 snapshot.plan.outline[0].content='Alcance: [Pendiente por completar]';
 assert.equal(preparationBlocker(4,snapshot,['f']),'pending-values');
 snapshot.plan.outline[0].content='Contenido revisado y guardado';
 assert.equal(preparationBlocker(4,snapshot,['f']),null);
 snapshot.facts.current=false;
 assert.equal(preparationBlocker(4,snapshot,['f']),'facts-before-draft');
 assert.equal(preparationBlocker(4,null,['f']),'loading');
});

test('a reviewed saved Word completes drafting without applying chapter drafts',()=>{
 const base={selectedFiles:['f'],analyses,plan:{version:3,outline:[{content:''}]},facts:{current:true,revision:1}};
 const word={kind:'technical-plan.export-word',state:'succeeded',artifactState:'stored',wordRevision:1,payload:{planVersion:3,draftBatchId:'batch'}};
 assert.equal(progress({...base,jobs:[word]}).states[4],'complete');
 assert.equal(preparationBlocker(4,{...base,jobs:[word]},['f']),null);
 for(const invalid of [{...word,wordRevision:0},{...word,artifactState:'deleted'},{...word,sourcesStale:true},{...word,payload:{planVersion:2}}])assert.notEqual(progress({...base,jobs:[invalid]}).states[4],'complete');
});

test('continue requires accepted analyses and an applied outline',()=>{
 assert.equal(preparationBlocker(1,null,['f']),'loading');
 assert.equal(preparationBlocker(1,{analyses:analyses.slice(0,2)},['f']),'analyses');
 assert.equal(preparationBlocker(1,{analyses},['f']),null);
 assert.equal(preparationBlocker(2,{analyses,outline:{selection:{current:true}}},['f']),'outline');
 assert.equal(preparationBlocker(2,{analyses,plan:{outline:[{content:''}]}},['f']),null);
});
