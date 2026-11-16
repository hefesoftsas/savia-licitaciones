import {test} from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createServer} from 'vite';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('explica la ausencia de actividad sin afirmar que una máquina está desconectada',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {RunnerActivityView}=await server.ssrLoadModule('/src/features/web/WebRunnerActivity.tsx');const now=Date.parse('2026-11-01T10:00:00Z'),render=(props)=>renderToStaticMarkup(React.createElement(RunnerActivityView,{language:'es',now,onOpen:()=>{},...props}));
  assert.equal(render({runners:null}),'');assert.match(render({runners:[]}),/Conecta un runner/);assert.match(render({runners:[{lastSeenAt:'2026-11-01T09:50:00Z'}]}),/Sin actividad reciente/);assert.equal(render({runners:[{lastSeenAt:'2026-11-01T09:59:30Z'}]}),'');assert.equal(render({runners:[{lastSeenAt:'2026-11-01T10:01:00Z'}]}),'');
  const en=renderToStaticMarkup(React.createElement(RunnerActivityView,{language:'en',now,onOpen:()=>{},runners:[]}));assert.match(en,/Connect a runner/);
 }finally{await server.close();}
});
test('un runner alojado deshabilitado no oculta la necesidad de conectar uno local',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {RunnerActivityView}=await server.ssrLoadModule('/src/features/web/WebRunnerActivity.tsx');const now=Date.parse('2026-11-01T10:00:00Z'),hosted={executionMode:'hosted',lastSeenAt:'2026-11-01T09:59:30Z'};
  const render=(language,runners)=>renderToStaticMarkup(React.createElement(RunnerActivityView,{language,now,onOpen:()=>{},runners}));
  assert.match(render('es',[hosted]),/Conecta un runner/);assert.match(render('en',[hosted]),/Connect a runner/);
  assert.match(render('es',[{executionMode:'desconocido',lastSeenAt:'2026-11-01T09:59:30Z'}]),/Conecta un runner/);
  assert.match(render('es',[hosted,{executionMode:'local',lastSeenAt:'2026-11-01T09:50:00Z'}]),/Sin actividad reciente/);
  assert.equal(render('es',[hosted,{executionMode:'local',lastSeenAt:'2026-11-01T09:59:30Z'}]),'');
 }finally{await server.close();}
});

test('indicador distingue estado desconocido, inactivo, disponible y ejecutando',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {RunnerActivityView}=await server.ssrLoadModule('/src/features/web/WebRunnerActivity.tsx');const now=Date.parse('2026-11-01T10:00:00Z'),render=runners=>renderToStaticMarkup(React.createElement(RunnerActivityView,{language:'es',compact:true,now,runners,onOpen(){}}));
 assert.match(render(null),/data-state="unknown"/);assert.match(render([]),/instalar o conectar/);assert.match(render([{lastSeenAt:'2026-11-01T09:59:30Z',runningJobs:0}]),/data-state="online"/);assert.match(render([{lastSeenAt:'2026-11-01T09:59:30Z',runningJobs:2}]),/Runner ejecutando 2 tarea/);assert.match(render([{executionMode:'hosted',lastSeenAt:'2026-11-01T09:59:30Z',runningJobs:2}]),/data-state="offline"/);
 }finally{await server.close();}
});
