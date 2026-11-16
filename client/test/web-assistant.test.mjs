import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('ofrece la búsqueda y los proyectos con una guía bilingüe y sin inventar un proyecto',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {WebAssistant}=await server.ssrLoadModule('/src/features/web/WebAssistant.tsx');
  const props={onSearch(){},onProjects(){}};
  const es=renderToStaticMarkup(React.createElement(WebAssistant,{...props,language:'es',project:null}));
  assert.match(es,/Buscar oportunidades/);assert.match(es,/Ver proyectos/);assert.match(es,/Revisar y exportar/);assert.doesNotMatch(es,/Retomar preparación/);
  const en=renderToStaticMarkup(React.createElement(WebAssistant,{...props,language:'en',project:{id:'1',title:'Hospital'}}));
  assert.match(en,/Hospital/);assert.match(en,/Resume preparation/);assert.match(en,/Review and export/);
 }finally{await server.close();}
});
