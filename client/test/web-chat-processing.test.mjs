import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('indica espera y ejecución con una acción accesible para cancelar',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {WebChatProcessing}=await server.ssrLoadModule('/src/features/web/WebProjectChat.tsx');
 const render=(state,progress,language='es')=>renderToStaticMarkup(React.createElement(WebChatProcessing,{state,progress,language,busy:false,onCancel(){}}));
 const waiting=render('queued',null);assert.match(waiting,/Esperando a tu runner/);assert.match(waiting,/aria-label="Cancelar respuesta"/);assert.match(waiting,/web-chat-processing-spinner/);
 const running=render('running','reading');assert.match(running,/Preparando la respuesta/);assert.match(running,/Consultando fuentes/);assert.match(render('running',null,'en'),/Cancel response/);
 }finally{await server.close();}
});
