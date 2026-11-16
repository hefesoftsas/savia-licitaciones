import {test} from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createServer} from 'vite';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('presenta recomendaciones, estado y acciones en español e inglés',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {OpportunityResultsView}=await server.ssrLoadModule('/src/features/web/WebOpportunitySuggestions.tsx');const item={id:'secop-ii:1',process:{id:'1',source:'secop-ii',title:'Servicio de salud',entity:'Hospital'},reason:'Experiencia relevante',checks:'Verificar pliego',reviewed:false,saved:false,projectId:null};const props={items:[item],jobId:'job',stale:true,busy:false,onReview:()=>{},onSave:()=>{},onOpen:()=>{}};const es=renderToStaticMarkup(React.createElement(OpportunityResultsView,{...props,language:'es'}));assert.match(es,/Servicio de salud/);assert.match(es,/Experiencia relevante/);assert.match(es,/Verificar pliego/);assert.match(es,/Marcar como revisada/);assert.match(es,/Guardar licitación/);assert.match(es,/cambiaron/i);const en=renderToStaticMarkup(React.createElement(OpportunityResultsView,{...props,language:'en'}));assert.match(en,/Mark as reviewed/);assert.match(en,/Save tender/);assert.match(en,/changed/i);}finally{await server.close();}
});

test('la búsqueda con runner requiere una opción explícita en ambos idiomas',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {RunnerAutomaticOption}=await server.ssrLoadModule('/src/features/web/WebOpportunitySuggestions.tsx');for(const language of ['es','en']){const html=renderToStaticMarkup(React.createElement(RunnerAutomaticOption,{language,checked:false,onChange:()=>{}}));assert.match(html,language==='es'?/runner local/i:/local runner/i);assert.doesNotMatch(html,/checked=""/);}}
 finally{await server.close();}
});

test('el selector muestra las credenciales de ambos proveedores',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {ProviderCredentialOptions}=await server.ssrLoadModule('/src/features/web/WebOpportunitySuggestions.tsx');const html=renderToStaticMarkup(React.createElement('select',null,React.createElement(ProviderCredentialOptions,{credentials:[{id:'go',provider:'opencode-go',model:'modelo-go'},{id:'openai',provider:'openai-api',model:'modelo-openai'},{id:'claude',provider:'anthropic-api',model:'modelo-claude'}]})));assert.match(html,/modelo-go/);assert.match(html,/modelo-openai/);assert.match(html,/modelo-claude/);}finally{await server.close();}
});

test('las revisadas no aparecen entre pendientes y pueden verse en el archivo',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {OpportunityResultsView}=await server.ssrLoadModule('/src/features/web/WebOpportunitySuggestions.tsx');const make=(id,reviewed)=>({id,process:{id,source:'secop-ii',title:id,entity:'Entidad'},reason:'Motivo',checks:'Comprobar',reviewed,saved:false,projectId:null});const html=renderToStaticMarkup(React.createElement(OpportunityResultsView,{language:'es',items:[make('pendiente',false),make('archivada',true)],jobId:'job',stale:false,busy:false,onReview(){},onSave(){},onOpen(){},archive:[{...make('archivada',true),jobId:'old'}],onLoadArchive(){}}));assert.equal((html.match(/>archivada</g)||[]).length,1);assert.match(html,/Recomendaciones archivadas/);assert.match(html,/pendiente/);}
 finally{await server.close();}
});
