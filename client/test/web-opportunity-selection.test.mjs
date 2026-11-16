import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('documentos oficiales muestran casillas accesibles y explican restricciones de selección',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try {
  const {OpportunityDocumentSelection}=await server.ssrLoadModule('/src/features/web/WebOpportunityDetail.tsx');
  const documents=[{id:'1',name:'Pliego.pdf',extension:'pdf',size:100},{id:'2',name:'Archivo grande.zip',extension:'zip',size:51*1024*1024}];
  const render=(props={})=>renderToStaticMarkup(React.createElement(OpportunityDocumentSelection,{documents,selectedIds:['1'],onChange:()=>{},language:'es',...props}));
  const html=render();
  assert.equal((html.match(/role="checkbox"/g)||[]).length,2);
  assert.match(html,/aria-checked="true"/);
  assert.match(html,/1 seleccionados/);
  assert.match(html,/Supera 50 MB/);
  assert.match(html,/Seleccionar cargados/);
  const limited=render({selectedIds:Array.from({length:100},(_,i)=>String(i+1)),language:'en'});
  assert.match(limited,/Selection limit reached/);
  assert.match(limited,/Exceeds 50 MB/);
 } finally {await server.close();}
});
