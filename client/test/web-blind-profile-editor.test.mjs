import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{createServer}=await import('vite');
const {findBuiltinPreset}=require('./electron/services/blindCheckPresets.cjs');
test('presenta las reglas editables sin ofrecer una conexión de datos empresariales inexistente',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {default:Editor}=await server.ssrLoadModule('/src/features/web/WebBlindProfileEditor.tsx'),{ToastProvider}=await server.ssrLoadModule('/src/shared/ui/ToastProvider.tsx'),{LanguageProvider}=await server.ssrLoadModule('/src/shared/i18n/index.ts');
  const html=renderToStaticMarkup(React.createElement(LanguageProvider,null,React.createElement(ToastProvider,null,React.createElement(Editor,{profile:findBuiltinPreset('builtin-general').profile,disabled:false,onChange:()=>{},onPendingChange:()=>{}}))));
  assert.match(html,/Page/);assert.match(html,/Paper size/);assert.doesNotMatch(html,/Use credential data/);
 }finally{await server.close();}
});
