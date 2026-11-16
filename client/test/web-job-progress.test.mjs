import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('muestra únicamente etapas activas de forma accesible y en ambos idiomas',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {WebJobProgress}=await server.ssrLoadModule('/src/features/web/WebJobProgress.tsx');
  const render=(state,progress,language)=>renderToStaticMarkup(React.createElement(WebJobProgress,{state,progress,language}));
  assert.match(render('running','reading','es'),/Consultando fuentes/);
  assert.match(render('running','generating','en'),/Generating content/);
  assert.match(render('running','preparing','es'),/role="status"/);
  assert.equal(render('succeeded','reading','es'),'');
  assert.equal(render('running','texto privado','es'),'');
 }finally{await server.close();}
});
