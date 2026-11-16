import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{createServer}=await import('vite');
test('presenta los límites del perfil y permite seleccionar un DOCX para revisión local',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {default:Review}=await server.ssrLoadModule('/src/features/web/WebBlindCheck.tsx'),{ToastProvider}=await server.ssrLoadModule('/src/shared/ui/ToastProvider.tsx'),{LanguageProvider}=await server.ssrLoadModule('/src/shared/i18n/index.ts');
  const html=renderToStaticMarkup(React.createElement(LanguageProvider,null,React.createElement(ToastProvider,null,React.createElement(Review,{projectId:'p',language:'es',files:[{id:'a',name:'Oferta.docx'},{id:'b',name:'otro.pdf'}],jobs:[],onRefresh:async()=>{}}))));
  assert.match(html,/Oferta.docx/);assert.doesNotMatch(html,/otro.pdf/);assert.match(html,/perfil general del escritorio/);assert.match(html,/no confirma el cumplimiento/i);assert.match(html,/sin enviar el documento a un proveedor de IA/i);assert.match(html,/Iniciar revisión/);assert.match(html,/Revisión adicional con IA/);
 }finally{await server.close();}
});
