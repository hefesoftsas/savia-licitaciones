import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareAccountCompanyProfileCapture} from '../account-company-profile-capture.mjs';

test('prepara imágenes de la cuenta y detecta cambios incluso si no hay perfil guardado',async()=>{
 const revision='a'.repeat(64),version='b'.repeat(64),calls=[];let current=revision;
 const capture={revision,profile:null,images:[{id:'img',name:'oficina.png',customName:'Oficina',fieldKey:'officeEnvironment',contentType:'image/png',size:2,sortOrder:0,createdAt:'2026',etag:'etag',version}]};
 const fetchImpl=async(url,options)=>{calls.push({url,options});return url.includes('/images/')?new Response('ab'):Response.json({...capture,revision:current});};
 const prepared=await prepareAccountCompanyProfileCapture({server:'https://example.test',token:'fixture',fetchImpl});assert.equal(prepared.profile,null);assert.equal(prepared.images.length,1);assert.equal(prepared.objects[0].id,'company-profile-image:img');let data='';for await(const chunk of await prepared.objects[0].open())data+=chunk;assert.equal(data,'ab');assert.ok(calls.every(item=>item.options.headers.authorization==='Bearer fixture'&&item.options.redirect==='error'));
 await prepared.assertUnchanged();current='c'.repeat(64);await assert.rejects(prepared.assertUnchanged(),/cambi/);
});
test('rechaza metadatos incompatibles antes de descargar imágenes',async()=>{
 const fetchImpl=async()=>Response.json({revision:'a'.repeat(64),profile:null,images:[{id:'../bad',size:2,etag:'x',version:'b'.repeat(64)}]});await assert.rejects(prepareAccountCompanyProfileCapture({server:'https://example.test',token:'fixture',fetchImpl}));
});
