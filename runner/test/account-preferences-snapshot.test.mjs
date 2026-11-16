import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {captureAccountPreferences,restoreAccountPreferences} from '../account-preferences-snapshot.mjs';
test('captura parcial verificable y recuperación con revisión explícita',async()=>{const root=await mkdtemp(join(tmpdir(),'savia-prefs-'));try{
 const preferences={language:'es',theme:'dark',colorTheme:'green',visualStyle:'nova'};let writes=0;
 const fetchImpl=async(_url,init)=>{if(init.method==='PUT'){writes++;const body=JSON.parse(init.body);assert.deepEqual(body,{expectedRevision:5,preferences});return Response.json({revision:6});}return Response.json({revision:3,preferences});};
 const directory=join(root,'snapshot');const manifest=await captureAccountPreferences({server:'http://localhost',token:'secret',directory,fetchImpl});assert.equal(manifest.complete,false);assert.ok(manifest.omitted.includes('other-account-data'));
 const result=await restoreAccountPreferences({server:'http://localhost',token:'secret',directory,expectedRevision:5,fetchImpl});assert.equal(result.revision,6);assert.equal(writes,1);
 await writeFile(join(directory,'metadata.json'),'{}');await assert.rejects(()=>restoreAccountPreferences({server:'http://localhost',token:'secret',directory,expectedRevision:5,fetchImpl}),/integridad/i);assert.equal(writes,1);
 }finally{await rm(root,{recursive:true,force:true});}});
test('aborta si cambian las preferencias durante la captura',async()=>{const root=await mkdtemp(join(tmpdir(),'savia-prefs-'));try{let revision=0;const fetchImpl=async()=>Response.json({revision:revision++,preferences:{language:'es',theme:'system',colorTheme:'neutral',visualStyle:'vega'}});await assert.rejects(()=>captureAccountPreferences({server:'http://localhost',token:'secret',directory:join(root,'snapshot'),fetchImpl}),/cambiaron/i);}finally{await rm(root,{recursive:true,force:true});}});
