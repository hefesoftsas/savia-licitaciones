import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {captureAccountCompanyProfile,restoreAccountCompanyProfile} from '../account-company-profile-snapshot.mjs';

test('captura y restaura imágenes sin perfil y detecta corrupción antes de modificar destino',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-profile-')),directory=join(root,'snapshot'),bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1]);let writes=0;
 const capture={revision:'a'.repeat(64),profile:null,images:[{id:'img',name:'oficina.png',customName:'',fieldKey:'officeEnvironment',contentType:'image/png',size:bytes.length,sortOrder:0,createdAt:'2026',etag:'etag',version:'b'.repeat(64)}]};
 const fetchImpl=async(url,options)=>{if(options.method==='POST'){writes++;return Response.json({imported:true});}return url.includes('/images/')?new Response(bytes):Response.json(capture);};
 try{await captureAccountCompanyProfile({server:'https://example.test',token:'fixture',directory,fetchImpl});const result=await restoreAccountCompanyProfile({server:'https://example.test',token:'fixture',directory,fetchImpl});assert.equal(result.images,1);assert.equal(writes,2);
 const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));await writeFile(join(directory,'objects',manifest.objects[0].file),'corrupt');writes=0;await assert.rejects(restoreAccountCompanyProfile({server:'https://example.test',token:'fixture',directory,fetchImpl}));assert.equal(writes,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
