import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('permite nueva conversación solo cuando existe historial sin consultas activas',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {WebChatReset}=await server.ssrLoadModule('/src/features/web/WebChatReset.tsx');
  const render=(language,jobs)=>renderToStaticMarkup(React.createElement(WebChatReset,{language,jobs,busy:false,onClear:async()=>true}));
  assert.match(render('es',[]),/<button[^>]*\sdisabled(?:=|\s|>)/);
  assert.match(render('en',[{kind:'tender-chat.send',state:'running'}]),/<button[^>]*\sdisabled(?:=|\s|>)/);
  const ready=render('es',[{kind:'tender-chat.send',state:'succeeded'}]);assert.match(ready,/Nueva conversación/);assert.doesNotMatch(ready,/<button[^>]*\sdisabled(?:=|\s|>)/);
 }finally{await server.close();}
});
