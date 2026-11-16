import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createArtifactOutbox,hasArtifactOutboxFiles} from '../artifact-outbox.mjs';
const job='12345678-1234-4234-8234-123456789abc';
test('guarda cifrado por flujo y exporta solo tras autenticar sin sobrescribir',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-artifact-outbox-'));try{const source=join(dir,'source.docx'),dest=join(dir,'recover.docx'),data=Buffer.alloc(26*1024*1024,0x61);data.write('contenido confidencial');await writeFile(source,data);const options={directory:join(dir,'outbox'),server:'https://example.test',runnerId:'runner',token:'fixture-token'},outbox=createArtifactOutbox(options);await outbox.save(job,source);assert.equal(await hasArtifactOutboxFiles(options.directory),true);const disk=await readFile(join(options.directory,`${job}.bin`));assert.equal(disk.includes(Buffer.from('contenido confidencial')),false);assert.deepEqual(await outbox.list(),[{jobId:job,state:'pending'}]);await outbox.export(job,dest);assert.deepEqual(await readFile(dest),data);await assert.rejects(outbox.export(job,dest),{code:'EEXIST'});await assert.rejects(createArtifactOutbox({...options,token:'other'}).export(job,join(dir,'wrong.docx')));await outbox.remove(job);assert.equal(await hasArtifactOutboxFiles(options.directory),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('no publica una exportación adulterada ni reemplaza una copia previa',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'savia-artifact-tamper-'));try{const source=join(dir,'source'),options={directory:join(dir,'outbox'),server:'https://example.test',runnerId:'runner',token:'fixture'},outbox=createArtifactOutbox(options);await writeFile(source,'original');await outbox.save(job,source);await assert.rejects(outbox.save(job,source),{code:'EEXIST'});const path=join(options.directory,`${job}.bin`),data=await readFile(path);data[data.length-17]^=1;await writeFile(path,data);const dest=join(dir,'bad.docx');await assert.rejects(outbox.export(job,dest));await assert.rejects(readFile(dest),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('el CLI exporta y retira copias y bloquea el reemparejamiento',async()=>{
 const {spawnSync}=await import('node:child_process'),{fileURLToPath}=await import('node:url'),dir=await mkdtemp(join(tmpdir(),'savia-artifact-cli-'));try{const config=join(dir,'runner.json'),source=join(dir,'source'),destination=join(dir,'recovered.docx'),server='https://example.test',runnerId='runner',token='fixture';await writeFile(config,JSON.stringify({server,runnerId,token}));await writeFile(source,'contenido privado');const outbox=createArtifactOutbox({directory:`${config}.artifacts`,server,runnerId,token});await outbox.save(job,source);const cli=process.env.SAVIA_TEST_RUNNER_CLI||fileURLToPath(new URL('../cli.mjs',import.meta.url));const run=(...args)=>spawnSync(process.execPath,[cli,...args,'--config',config],{encoding:'utf8',input:'a'.repeat(64)+'\n'});
  const listing=run('outbox-list','--kind','artifact');assert.equal(listing.status,0,listing.stderr);assert.match(listing.stdout,new RegExp(job));const pair=run('pair','--server',server);assert.notEqual(pair.status,0);assert.match(pair.stderr,/pendient/i);const exported=run('outbox-export','--kind','artifact','--job',job,'--output',destination);assert.equal(exported.status,0,exported.stderr);assert.equal(await readFile(destination,'utf8'),'contenido privado');assert.doesNotMatch(exported.stdout,/contenido privado|fixture/);const discarded=run('outbox-discard','--kind','artifact','--job',job,'--state','pending');assert.equal(discarded.status,0,discarded.stderr);assert.equal(await hasArtifactOutboxFiles(`${config}.artifacts`),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
