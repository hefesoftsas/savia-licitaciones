import {test} from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createServer} from 'vite';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('presenta las fuentes y revisiones sin seleccionar ganador',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {CompareOffersTable}=await server.ssrLoadModule('/src/features/web/WebCompareOffers.tsx');
  const criterion={id:'c',name:'Experiencia',tenderSourceId:'t',tenderQuote:'Cita pliego',maxPoints:10,bidSourceId:'b',bidQuote:'Cita oferta'};
  const run={id:'a',createdAt:'2026-01-01T00:00:00Z',tenderSources:[{id:'t',name:'Pliego',text:'Cita pliego'}],bidSources:[{id:'b',name:'Oferta',text:'Cita oferta'}],result:{criteria:[criterion]},reviews:[{criterionId:'c',status:'accepted',score:8,note:'Revisado'}]};
  const render=language=>renderToStaticMarkup(React.createElement(CompareOffersTable,{language,runs:[run,{...run,id:'b'}]}));
  const es=render('es');assert.match(es,/Cita pliego/);assert.match(es,/Cita oferta/);assert.match(es,/Puntaje revisado/);assert.match(es,/no se selecciona un ganador/i);
  const en=render('en');assert.match(en,/Reviewed score/);assert.match(en,/no winner is selected/i);
 }finally{await server.close();}
});
