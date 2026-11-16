import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('presenta la importación ZIP, su estado y reintento sin prometer que está importado',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {OfficialDocumentsView}=await server.ssrLoadModule('/src/features/web/WebSecop.tsx');
  const render=(documents,language='es')=>renderToStaticMarkup(React.createElement(OfficialDocumentsView,{documents,language,partial:false,importing:'',onImport:()=>{},onCancel:()=>{}}));
  const downloading=renderToStaticMarkup(React.createElement(OfficialDocumentsView,{documents:[{id:'1',name:'pliego.pdf',extension:'pdf',imported:false}],language:'es',partial:false,importing:'1',onImport:()=>{},onCancel:()=>{}}));assert.match(downloading,/Descargando/);assert.match(downloading,/<progress/);assert.doesNotMatch(downloading,/<progress[^>]*value=/);
  const queued=render([{id:'1',name:'anexos.zip',extension:'zip',imported:false,zipJob:{id:'j',state:'queued',result:null}}]);
  assert.match(queued,/anexos.zip/);assert.match(queued,/En espera/);assert.match(queued,/runner local/i);assert.match(queued,/Cancelar/);assert.doesNotMatch(queued,/>Importado</);
  const failed=render([{id:'1',name:'anexos.zip',extension:'zip',imported:false,zipJob:{id:'j',state:'failed',result:{message:'Descarga fallida'}}}]);
  assert.match(failed,/Descarga fallida/);assert.match(failed,/Reintentar/);
  const completed=render([{id:'1',name:'anexos.zip',extension:'zip',imported:true,zipJob:{id:'j',state:'succeeded',result:{imported:2,skipped:1}}}]);
  assert.match(completed,/>Importado</);assert.match(completed,/2 documentos/);assert.match(completed,/1 omitido/);
  const english=render([{id:'1',name:'annex.zip',extension:'zip',imported:false,zipJob:{id:'j',state:'running',result:null}}],'en');assert.match(english,/In progress/);assert.match(english,/Cancel/);
 }finally{await server.close();}
});
