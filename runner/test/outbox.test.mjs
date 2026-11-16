import { test } from 'node:test';
import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOutbox } from '../outbox.mjs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const job = '12345678-1234-4234-8234-123456789abc';
const config = { server: 'https://savia.example', runnerId: 'runner-1', token: 'a'.repeat(64) };
test('guarda resultados cifrados, detecta alteraciones y permite exportación explícita', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savia-outbox-'));
  try {
    const outbox = createOutbox({ directory: join(dir, 'outbox'), ...config });
    const completion = { lease: 'lease-secreto', status: 'succeeded', result: { text: 'dato privado' } };
    await outbox.save(job, completion);
    const pending = await outbox.list(); assert.deepEqual(pending.map(item => [item.jobId, item.state]), [[job, 'pending']]);
    const contents = await readFile(join(dir, 'outbox', `${job}.json`), 'utf8');
    if (process.platform !== 'win32') assert.equal((await stat(join(dir, 'outbox', `${job}.json`))).mode & 0o777, 0o600);
    assert.equal(contents.includes('dato privado'), false); assert.equal(contents.includes('lease-secreto'), false); assert.equal(contents.includes(config.token), false);
    assert.deepEqual(await outbox.read(job, 'pending'), completion);
    const other = createOutbox({ directory: join(dir, 'outbox'), ...config, token: 'b'.repeat(64) });
    await assert.rejects(other.read(job, 'pending'));
    const altered = JSON.parse(contents); const bytes = Buffer.from(altered.data, 'base64'); bytes[0] ^= 1; altered.data = bytes.toString('base64');
    await writeFile(join(dir, 'outbox', `${job}.json`), JSON.stringify(altered));
    await assert.rejects(outbox.read(job, 'pending'));
    await writeFile(join(dir, 'outbox', `${job}.json`), contents);
    await outbox.reject(job); assert.equal((await outbox.list())[0].state, 'rejected');
    const target = join(dir, 'export.json'); await outbox.export(job, target);
    if (process.platform !== 'win32') assert.equal((await stat(target)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), { jobId: job, status: completion.status, result: completion.result });
    await assert.rejects(outbox.export(job, target), { code: 'EEXIST' });
    await outbox.remove(job, 'rejected'); assert.deepEqual(await outbox.list(), []);
    assert.deepEqual(await readdir(join(dir, 'outbox', 'rejected')), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('la CLI permite revisar borradores y protege el emparejamiento pendiente',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-draft-cli-')),configPath=join(dir,'runner.json'),job='12345678-1234-4234-8234-123456789abc',cli=fileURLToPath(new URL('../cli.mjs',import.meta.url)),config={server:'http://localhost:1234',runnerId:'fixture',token:'token'};
 try{await writeFile(configPath,JSON.stringify(config));const outbox=createOutbox({directory:`${configPath}.drafts`,...config});await outbox.save(job,{lease:'secret',status:'technical-draft',result:{nodeId:'node',content:'Borrador'}});await outbox.reject(job);
 const run=(...args)=>execFileSync(process.execPath,[cli,...args,'--config',configPath],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.match(run('outbox-list','--kind','draft'),new RegExp(`${job} rejected`));const dest=join(dir,'draft.json');run('outbox-export','--kind','draft','--job',job,'--output',dest);assert.equal(JSON.parse(await readFile(dest,'utf8')).result.content,'Borrador');
 assert.throws(()=>run('pair','--server',config.server));run('outbox-discard','--kind','draft','--job',job,'--state','rejected');assert.deepEqual(await outbox.list(),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('no publica una copia cifrada que supere el límite del lector en bytes UTF-8',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-outbox-size-'));
 try{const outbox=createOutbox({directory:join(dir,'outbox'),...config});
  const large={lease:'lease',status:'succeeded',result:{text:'ñ'.repeat(2_500_000)}};
  await assert.rejects(outbox.save(job,large),/tamaño|límite/i);assert.deepEqual(await outbox.list(),[]);
  const valid={lease:'lease',status:'succeeded',result:{text:'ñ'.repeat(2_499_000)}};
  await outbox.save(job,valid);assert.deepEqual(await outbox.read(job,'pending'),valid);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('recupera un traslado interrumpido sin duplicar ni dañar el resultado',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-outbox-move-'));try{const directory=join(dir,'outbox'),outbox=createOutbox({directory,...config}),value={lease:'l',status:'failed',result:{text:'dato'}};
  await outbox.save(job,value);await mkdir(join(directory,'rejected'));await link(join(directory,`${job}.json`),join(directory,'rejected',`${job}.json`));
  assert.equal((await outbox.list()).length,2);await outbox.reject(job);assert.deepEqual(await outbox.read(job,'rejected'),value);assert.deepEqual((await outbox.list()).map(item=>item.state),['rejected']);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('una exportación fallida no publica un resultado incompleto ni borra la copia cifrada',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-outbox-export-'));try{
  const directory=join(dir,'outbox'),target=join(dir,'resultado.json'),completion={lease:'secreto',status:'succeeded',result:{text:'contenido'}};
  const outbox=createOutbox({directory,...config,exportPublish:async()=>{throw new Error('fallo simulado');}});await outbox.save(job,completion);
  await assert.rejects(outbox.export(job,target),/fallo simulado/);await assert.rejects(readFile(target),{code:'ENOENT'});assert.deepEqual(await outbox.read(job,'pending'),completion);
  assert.deepEqual((await readdir(dir)).sort(),['outbox']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
