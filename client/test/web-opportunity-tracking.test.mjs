import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('el seguimiento presenta decisión personal, responsable y notas en ambos idiomas',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {OpportunityTrackingView}=await server.ssrLoadModule('/src/features/web/WebOpportunityTracking.tsx');
  const value={decision:'review',owner:'Ana',notes:'Nota',version:1,updatedAt:null};
  const render=language=>renderToStaticMarkup(React.createElement(OpportunityTrackingView,{language,value,busy:false,onChange(){},onSave(){}}));
  const es=render('es');assert.match(es,/independiente del estado publicado/);assert.match(es,/Responsable/);assert.match(es,/Notas/);assert.match(es,/Guardar seguimiento/);
  const en=render('en');assert.match(en,/separate from the status published/);assert.match(en,/Responsible person/);assert.match(en,/Notes/);assert.match(en,/Save tracking/);
 }finally{await server.close();}
});
