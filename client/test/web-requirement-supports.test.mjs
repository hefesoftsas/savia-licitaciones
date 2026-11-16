import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('muestra estado y vínculo no disponible en ambos idiomas',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {RequirementSupportsView}=await server.ssrLoadModule('/src/features/web/WebRequirementSupports.tsx');
  const items=[{id:'s',title:'Experiencia',status:'reviewed',linkType:'certificate',linkId:'old',linkAvailable:false,version:1}];
  const render=language=>renderToStaticMarkup(React.createElement(RequirementSupportsView,{language,items,candidates:[],busy:false,title:'',onTitle(){},onAdd(){},onUpdate(){},onRemove(){}}));
  const es=render('es');assert.match(es,/Experiencia/);assert.match(es,/no demuestra cumplimiento/);assert.match(es,/No disponible/);assert.match(es,/Revisado/);assert.match(es,/Agregar documento/);
  const en=render('en');assert.match(en,/does not prove compliance/);assert.match(en,/Unavailable/);assert.match(en,/Reviewed/);assert.match(en,/Add document/);
 }finally{await server.close();}
});
