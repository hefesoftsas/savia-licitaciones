import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('muestra consumo informado, parcial o no disponible sin inventar costos',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try {const {WebChatUsage}=await server.ssrLoadModule('/src/features/web/WebChatUsage.tsx');
  const usage={input:17,output:6,cacheRead:3,cacheWrite:2,reportedCalls:2,unreportedCalls:0};
  const render=(props={})=>renderToStaticMarkup(React.createElement(WebChatUsage,{language:'es',usage,...props}));
  assert.match(render(),/Consumo reportado/);assert.match(render(),/17/);assert.match(render(),/Caché leída/);assert.match(render(),/puede aparecer como cero/);
  assert.match(render({usage:{...usage,unreportedCalls:1}}),/parcial/);
  assert.match(render({usage:undefined}),/Consumo no disponible/);
  assert.match(render({usage:{...usage,reportedCalls:0}}),/Consumo no disponible/);
  assert.match(render({language:'en'}),/Reported usage/);
  assert.match(render({scope:'attempt'}),/último intento/);
  assert.match(render({scope:'attempt',language:'en'}),/last attempt/);
 } finally {await server.close();}
});
