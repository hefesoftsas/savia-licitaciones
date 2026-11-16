import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {captureAccountComponents,accountComponentNames} from '../account-components-capture.mjs';
import {createComponentSnapshot} from '../cloud-snapshot-archive.mjs';
import {restoreAccountComponents} from '../account-components-restore.mjs';
const label=name=>name==='feasibility'?'account-feasibility-components':`account-${name}`;
async function fixture(root){const destination=join(root,'capture'),captures=Object.fromEntries(accountComponentNames.map(name=>[name,({directory})=>createComponentSnapshot(directory,{metadata:{name},included:[label(name)],omitted:['other-account-data','credentials'],objects:[]})]));await captureAccountComponents({server:'https://example.invalid',token:'secret',destination,captures});return destination;}

test('verifica todo, recupera preferencias al final con revisión y devuelve resultados',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-account-restore-'));try{
  const directory=await fixture(root),calls=[],restores=Object.fromEntries(accountComponentNames.map(name=>[name,async options=>{calls.push(name);assert.equal(options.token,'secret');if(name==='preferences')assert.equal(options.expectedRevision,4);return {count:1};}]));
  const result=await restoreAccountComponents({server:'https://example.invalid',token:'secret',directory,expectedRevision:4,restores,readPreferences:async()=>({revision:4})});
  assert.deepEqual(calls,[...accountComponentNames.filter(name=>name!=='preferences'),'preferences']);assert.equal(result.complete,false);assert.equal(result.components.preferences.count,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('no modifica el destino si falta revisión, se altera un componente o cambia el índice',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-account-restore-bad-'));try{
  const directory=await fixture(root);let calls=0;const restores=Object.fromEntries(accountComponentNames.map(name=>[name,async()=>{calls++;}]));
  await assert.rejects(restoreAccountComponents({directory,restores}),/revisión/i);assert.equal(calls,0);
  await assert.rejects(restoreAccountComponents({directory,expectedRevision:0,restores,readPreferences:async()=>({revision:1})}),/cambiaron/i);assert.equal(calls,0);
  const metadata=join(directory,'feasibility','metadata.json'),original=await readFile(metadata,'utf8');await writeFile(metadata,'{}');await assert.rejects(restoreAccountComponents({directory,expectedRevision:0,restores}),/integridad/i);assert.equal(calls,0);await writeFile(metadata,original);
  const index=join(directory,'index.json'),data=JSON.parse(await readFile(index,'utf8'));data.components.push('../ajeno');await writeFile(index,JSON.stringify(data));await assert.rejects(restoreAccountComponents({directory,expectedRevision:0,restores}),/índice/i);assert.equal(calls,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('detiene al fallar un componente y permite repetir sin aplicar preferencias antes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-account-restore-fail-'));try{
  const directory=await fixture(root);let fail=true;const calls=[],restores=Object.fromEntries(accountComponentNames.map(name=>[name,async()=>{calls.push(name);if(name==='rup'&&fail)throw new Error('conflicto');return {removed:1};}]));
  await assert.rejects(restoreAccountComponents({directory,expectedRevision:0,restores,readPreferences:async()=>({revision:0})}),/rup.*conflicto/i);assert.ok(!calls.includes('preferences'));fail=false;calls.length=0;
  const result=await restoreAccountComponents({directory,expectedRevision:0,restores,readPreferences:async()=>({revision:0})});assert.equal(result.components.rup.removed,1);assert.equal(calls.at(-1),'preferences');
 }finally{await rm(root,{recursive:true,force:true});}
});
