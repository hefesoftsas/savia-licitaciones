import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('muestra documentos importados, orden, advertencias y vínculos en ambos idiomas',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{
  const {OfferDocumentsView}=await server.ssrLoadModule('/src/features/web/WebOfferDocuments.tsx');
  const documents=[{id:'a',name:'Oferta.pdf',fileId:'file-a',missingReason:null},{id:'b',name:'Ausente.pdf',fileId:null,missingReason:'outside_backup'}];
  const links=[{id:'l',documentId:'a',requirementId:'r',supportId:'s',unresolvedDocument:false,unresolvedRequirement:false,unresolvedSupport:false},{id:'orphan',documentId:'old',requirementId:'old-r',supportId:'old-s',unresolvedDocument:true,unresolvedRequirement:true,unresolvedSupport:true}];
  const presentation=[{id:'p',documentId:'a',unresolvedDocument:false,sortOrder:0,state:'review',reviewRequired:true},{id:'missing',documentId:'b',unresolvedDocument:false,sortOrder:1,state:'missing',reviewRequired:true},{id:'orphan-package',documentId:'old',unresolvedDocument:true,sortOrder:2,state:'missing',reviewRequired:true}];
  const render=language=>renderToStaticMarkup(React.createElement(OfferDocumentsView,{language,projectId:'project',documents:[...documents,{id:'c',name:'Nuevo.pdf',fileId:'c-file',missingReason:null,version:1}],links,presentation,requirements:[{id:'r',title:'Experiencia'}],supports:[{id:'s',title:'Certificado',version:1,requirementId:'r',requirementTitle:'Experiencia',requirementVersion:1}],files:[{id:'replacement',name:'Reemplazo.pdf',size:10}],onRepair(){},onReplace(){},onReview(){},onAdd(){},onAddPackage(){},onRemovePackage(){},onMovePackage(){},onLink(){},onUnlink(){},onRemoveDocument(){},onRepairLink(){},onRepairPackage(){}}));
  const es=render('es');assert.match(es,/Oferta.pdf/);assert.match(es,/Ausente.pdf/);assert.match(es,/Experiencia/);assert.match(es,/Requiere revisión/);assert.match(es,/Ausente.pdf · Archivo no disponible · Requiere revisión/);assert.match(es,/vínculo histórico/i);assert.match(es,/\/api\/projects\/project\/files\/file-a/);
  assert.match(es,/Reemplazo.pdf/);assert.match(es,/Vincular archivo/);assert.match(es,/Confirmar revisión/);assert.match(es,/Agregar a documentos de oferta/);assert.match(es,/Añadir al paquete/);assert.match(es,/Quitar del paquete/);assert.match(es,/Subir Ausente.pdf/);assert.match(es,/Vincular soporte/);assert.equal((es.match(/Quitar vínculo/g)||[]).length,2);assert.match(es,/Quitar documento de oferta/);assert.match(es,/Sustituir archivo/);assert.match(es,/Reparar vínculo/);assert.match(es,/Reparar elemento del paquete/);const en=render('en');assert.match(en,/Review required/);assert.match(en,/unavailable/);assert.match(en,/historical link/i);assert.match(en,/Link file/);assert.match(en,/Confirm review/);assert.match(en,/Add to offer documents/);assert.match(en,/Add to package/);assert.match(en,/Remove from package/);assert.match(en,/Move up Ausente.pdf/);assert.match(en,/Link evidence/);assert.equal((en.match(/Remove link/g)||[]).length,2);assert.match(en,/Remove offer document/);assert.match(en,/Replace file/);assert.match(en,/Repair link/);assert.match(en,/Repair package item/);
 }finally{await server.close();}
});
