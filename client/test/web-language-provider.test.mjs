import {test} from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {createServer} from 'vite';import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('los componentes compartidos reciben el idioma controlado por la web',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {ControlledLanguageProvider,useLanguage}=await server.ssrLoadModule('/src/shared/i18n/LanguageContext.tsx');function Probe(){const {language,t}=useLanguage();return React.createElement('span',null,`${language}:${t('common.cancel')}`);}const render=language=>renderToStaticMarkup(React.createElement(ControlledLanguageProvider,{language,onLanguageChange(){}},React.createElement(Probe)));assert.match(render('es'),/es:Cancelar/);assert.match(render('en'),/en:Cancel/);
 }finally{await server.close();}
});
