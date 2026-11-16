import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('la administración permite crear organizaciones y usuarios en español e inglés',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {TenantForms}=await server.ssrLoadModule('/src/features/web/WebTenantAdmin.tsx');const render=language=>renderToStaticMarkup(React.createElement(TenantForms,{language,tenants:[{id:'a',name:'Empresa A'}],selected:'a',busy:false,tenantSheetOpen:false,onTenantSheetOpenChange(){},onSelect(){},onCreateTenant:async()=>true,onCreateUser:async()=>true}));assert.match(render('es'),/Organización/);assert.match(render('es'),/Nuevo usuario/);assert.match(render('es'),/Empresa A/);assert.match(render('en'),/Organization/);assert.match(render('en'),/New user/);const {TenantMembers}=await server.ssrLoadModule('/src/features/web/WebTenantAdmin.tsx');const list=renderToStaticMarkup(React.createElement(TenantMembers,{language:'es',members:[{id:'1',name:'Ana',email:'ana@example.test',banned:0}]}));assert.doesNotMatch(list,/example\.test\s*0/);}finally{await server.close();}
});
