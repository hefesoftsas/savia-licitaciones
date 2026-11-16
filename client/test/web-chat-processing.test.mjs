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
 const render=(state,progress,language='es',extra={})=>renderToStaticMarkup(React.createElement(WebChatProcessing,{state,progress,language,busy:false,onCancel(){},...extra}));
 const waiting=render('queued',null);
 assert.match(waiting,/Esperando a tu runner/);
 assert.match(waiting,/aria-label="Cancelar respuesta"/);
 assert.match(waiting,/>Cancelar<\/button>/);
 assert.doesNotMatch(waiting,/data-icon-action="true"/);
 assert.match(waiting,/web-chat-processing-spinner/);
 assert.match(waiting,/web-chat-processing-timer[^>]*>0:00</);

 const running=render('running','reading');
 assert.match(running,/Preparando la respuesta/);
 assert.match(running,/Consultando fuentes/);
 assert.doesNotMatch(running,/web-analysis-activity/);

 const runningEn=render('running','generating','en',{createdAt:new Date(Date.now()-65_000).toISOString()});
 assert.match(runningEn,/Preparing an answer/);
 assert.match(runningEn,/aria-label="Cancel response"/);
 assert.match(runningEn,/>Cancel<\/button>/);
 assert.match(runningEn,/web-chat-processing-timer[^>]*>1:0[56]</);

 const withActivity=render('running','reading','es',{projectId:'proj-1',jobId:'job-1',runnerName:'Mi Runner'});
 assert.match(withActivity,/web-chat-processing-activity/);
 assert.match(withActivity,/web-analysis-activity/);
 assert.match(withActivity,/Mi Runner/);
 assert.match(withActivity,/aria-current="step"[^>]*>Consultando fuentes</);
 }finally{await server.close();}
});
