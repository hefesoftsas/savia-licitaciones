import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('el perfil ofrece datos de empresa, finanzas y marca de agua en ambos idiomas',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {CompanyProfileForm,emptyCompanyProfile}=await server.ssrLoadModule('/src/features/web/WebCompanyProfile.tsx');
  const profile={...emptyCompanyProfile(),companyName:'Empresa Ñ',businessScope:'Software',bankAccountNumber:'123'};
  const render=(language,activeGroup)=>renderToStaticMarkup(React.createElement(CompanyProfileForm,{profile,language,dirty:true,busy:false,activeGroup,onChange:()=>{},onSave:()=>{},onCancel:()=>{}}));
  const esBasic=render('es',0);assert.match(esBasic,/Empresa Ñ/);assert.match(esBasic,/Guardar cambios/);
  const esActivity=render('es',1);assert.match(esActivity,/Actividad económica/);
  const esFinance=render('es',2);assert.match(esFinance,/Número de cuenta/);
  const esWatermark=render('es',3);assert.match(esWatermark,/no se aplica automáticamente/);
  const enBasic=render('en',0);assert.match(enBasic,/Save changes/);
  const enActivity=render('en',1);assert.match(enActivity,/Business activity/);
  const enFinance=render('en',2);assert.match(enFinance,/Account number/);
  const enWatermark=render('en',3);assert.match(enWatermark,/not applied automatically/);
  assert.equal(render('es',99),'');
 }finally{await server.close();}
});
