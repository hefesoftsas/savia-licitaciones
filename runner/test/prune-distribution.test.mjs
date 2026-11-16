import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm,access,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,dirname} from 'node:path';
import {pruneDistribution} from '../prune-distribution.mjs';
test('keeps runtime dependency graph and peer/native files, excludes UI packages and debug maps',async()=>{
 const client=await mkdtemp(join(tmpdir(),'savia-prune-'));
 try{
  const modules=join(client,'node_modules'),store=join(modules,'.pnpm');await mkdir(store,{recursive:true});
  async function pkg(name,manifest={}){const dir=join(store,name+'@1','node_modules',name);await mkdir(dir,{recursive:true});await writeFile(join(dir,'package.json'),JSON.stringify({name,version:'1.0.0',...manifest}));await writeFile(join(dir,'index.js'),'module.exports=1;');return dir;}
  async function link(target,path){await mkdir(dirname(path),{recursive:true});await symlink(relative(dirname(path),target),path,process.platform==='win32'?'junction':undefined);}
  const native=await pkg('native'),peer=await pkg('peer'),ui=await pkg('ui'),run=await pkg('run',{dependencies:{native:'1'},peerDependencies:{peer:'1',missing:'1'},peerDependenciesMeta:{missing:{optional:true}}});
  await writeFile(join(native,'binary.node'),'native-runtime');await writeFile(join(run,'index.js.map'),'debug');await writeFile(join(run,'data.map'),'runtime-data');
  await link(native,join(dirname(run),'native'));await link(peer,join(dirname(run),'peer'));
  await link(run,join(modules,'run'));await link(ui,join(modules,'ui'));await link(ui,join(store,'node_modules','ui'));
  await writeFile(join(client,'package.json'),JSON.stringify({dependencies:{run:'1',ui:'1'},devDependencies:{dev:'1'}}));
  const result=await pruneDistribution(client,['run']);assert.equal(result.packages,3);
  await access(join(native,'binary.node'));await access(join(run,'data.map'));await access(join(peer,'index.js'));
  assert.equal(await realpath(join(modules,'run')),await realpath(run));
  await assert.rejects(access(ui));await assert.rejects(access(join(modules,'ui')));await assert.rejects(access(join(store,'node_modules','ui')));await assert.rejects(access(join(run,'index.js.map')));
  assert.deepEqual(JSON.parse(await readFile(join(client,'package.json'),'utf8')),{dependencies:{run:'1'}});
 }finally{await rm(client,{recursive:true,force:true});}
});
