import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{createServer}=await import('vite');

test('el informe pagina resultados y distingue errores de una revisión sin coincidencias',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {default:Report}=await server.ssrLoadModule('/src/features/web/WebDuplicateReport.tsx');
  const {ToastProvider}=await server.ssrLoadModule('/src/shared/ui/ToastProvider.tsx');
  const {LanguageProvider}=await server.ssrLoadModule('/src/shared/i18n/index.ts');
  const sentences=Array.from({length:65},(_,i)=>({id:String(i),sentence:`Frase ${i}`,file_ids:['a'],occurrences:{a:2}}));
  const report={status:'error',metadataAnalysis:{status:'error',rows:[]},contentAnalysis:{status:'success',duplicateSentences:sentences},outlineAnalysis:{status:'success',duplicateGroups:[]},imageAnalysis:{status:'success',duplicateImages:[]}};
  const html=renderToStaticMarkup(React.createElement(LanguageProvider,null,React.createElement(ToastProvider,null,React.createElement(Report,{report,language:'es',name:()=> 'Oferta A'}))));
  assert.match(html,/El análisis falló; no hay una conclusión disponible/);assert.match(html,/No se registraron coincidencias/);assert.match(html,/Página.*1.*2/);assert.match(html,/Frase 49/);assert.doesNotMatch(html,/Frase 50/);assert.match(html,/Oferta A × 2/);
 }finally{await server.close();}
});
