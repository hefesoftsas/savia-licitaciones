import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('muestra usuarios, roles y acceso en ambos idiomas sin permitir acciones sobre la cuenta propia',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {AdminUsersList}=await server.ssrLoadModule('/src/features/web/WebAdminUsers.tsx');const users=[{id:'self',name:'Admin',email:'admin@example.test',role:'superadmin',banned:false},{id:'other',name:'Ana',email:'ana@example.test',role:'user',banned:true}];const render=language=>renderToStaticMarkup(React.createElement(AdminUsersList,{language,users,currentUserId:'self',busy:false,sortKey:'name',sortDir:'asc',onSort(){},onEdit(){}}));const es=render('es');assert.match(es,/Ana/);assert.match(es,/ana@example.test/);assert.match(es,/Superadministrador/);assert.match(es,/Suspendido/);assert.match(es,/Editar/);assert.match(es,/Tú/);const en=render('en');assert.match(en,/Superadmin/);assert.match(en,/Suspended/);assert.match(en,/Edit/);assert.match(en,/You/);}finally{await server.close();}
});
test('la cuenta muestra el rol de superadministrador solo cuando corresponde',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {default:WebAccount}=await server.ssrLoadModule('/src/features/web/WebAccount.tsx');const {ToastProvider}=await server.ssrLoadModule('/src/shared/ui/ToastProvider.tsx');const render=user=>renderToStaticMarkup(React.createElement(ToastProvider,null,React.createElement(WebAccount,{language:'es',user})));assert.match(render({id:'self',role:'superadmin'}),/Superadministrador/);assert.match(render({id:'self',role:'user,superadmin'}),/Superadministrador/);assert.doesNotMatch(render({id:'self',role:'user'}),/Superadministrador/);assert.match(render({id:'self',role:'user',name:'Empresa A'}),/Empresa A/);}finally{await server.close();}
});
