import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{createServer}=await import('vite');

test('presenta la revisión de causales con criterios editables sin autorización adicional',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {default:Review}=await server.ssrLoadModule('/src/features/web/WebRejectionCheck.tsx'),{ToastProvider}=await server.ssrLoadModule('/src/shared/ui/ToastProvider.tsx'),{LanguageProvider}=await server.ssrLoadModule('/src/shared/i18n/index.ts');
  const html=renderToStaticMarkup(React.createElement(LanguageProvider,null,React.createElement(ToastProvider,null,React.createElement(Review,{projectId:'p',language:'es',files:[{id:'doc',name:'Pliego ñ.pdf'}],jobs:[],credentialId:'c',onRefresh:async()=>{},onDirtyChange:()=>{}}))));
  assert.match(html,/Pliego ñ.pdf/);assert.match(html,/Obtén o escribe las causales de rechazo/);assert.match(html,/>Causales de rechazo<\/span>/);assert.doesNotMatch(html,/Autorizo enviar los documentos seleccionados/);assert.match(html,/Guardar borrador/);assert.match(html,/Cargando borrador/);assert.match(html,/<button[^>]*disabled=""[^>]*>[\s\S]*?Extraer causales de los pliegos<\/button>/);assert.match(html,/<button[^>]*disabled=""[^>]*>[\s\S]*?Iniciar revisión<\/button>/);
 }finally{await server.close();}
});
