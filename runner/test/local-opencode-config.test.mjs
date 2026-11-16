import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readLocalOpenCodeConfig} from '../local-opencode-config.mjs';

test('lee el modelo reciente y la credencial local sin transferirla',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-opencode-config-'));
 try { await mkdir(join(root,'data','opencode'),{recursive:true});await mkdir(join(root,'state','opencode'),{recursive:true});
 await writeFile(join(root,'data','opencode','auth.json'),JSON.stringify({'opencode-go':{type:'api',key:'local-test-key'}}));
 await writeFile(join(root,'state','opencode','model.json'),JSON.stringify({recent:[{providerID:'opencode-go',modelID:'muse-spark-1.3-contributor'}]}));
 const config=await readLocalOpenCodeConfig({dataHome:join(root,'data'),stateHome:join(root,'state')});assert.deepEqual(config,{provider:'opencode-go',model:'muse-spark-1.3-contributor',secret:'local-test-key'});
 } finally {await rm(root,{recursive:true,force:true});}
});
test('no inventa un modelo si falta una configuración compatible',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-opencode-config-'));try{assert.equal(await readLocalOpenCodeConfig({dataHome:root,stateHome:root}),null);}finally{await rm(root,{recursive:true,force:true});}
});
