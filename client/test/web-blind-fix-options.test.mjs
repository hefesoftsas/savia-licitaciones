import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{createServer}=await import('vite');
test('muestra opciones explícitas de corrección y sus efectos',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {default:Options}=await server.ssrLoadModule('/src/features/web/WebBlindFixOptions.tsx');const html=renderToStaticMarkup(React.createElement(Options,{language:'es',selected:[],disabled:false,onChange:()=>{}}));assert.match(html,/Propiedades del documento/);assert.match(html,/Texto oculto/);assert.match(html,/Imágenes en color/);assert.doesNotMatch(html,/checked=""/);}finally{await server.close();}
});
