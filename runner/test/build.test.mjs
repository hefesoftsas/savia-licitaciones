import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const builder = fileURLToPath(new URL('../build.mjs', import.meta.url));
test('el empaquetador no sobrescribe una carpeta existente', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'savia-runner-existing-'));
  try {
    await writeFile(join(dir, 'marker'), 'conservar');
    const result = spawnSync(process.execPath, [builder, '--output', dir], { encoding: 'utf8', timeout: 10_000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /existe|exists/i);
    assert.equal(await readFile(join(dir, 'marker'), 'utf8'), 'conservar');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('la preparación de caché rechaza fuentes no verificadas antes de consultar o desplegar',{skip:process.platform==='win32'},async()=>{
 const {mkdir,copyFile,readFile,writeFile,rm,mkdtemp}=await import('node:fs/promises'),{dirname,resolve}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'savia-runner-cache-policy-'));
 try{
  const original=resolve(dirname(builder),'..');for(const name of ['runner/build.mjs','runner/prune-distribution.mjs','scripts/verify-dependency-age.mjs']){await mkdir(dirname(join(dir,name)),{recursive:true});await copyFile(join(original,name),join(dir,name));}
  for(const name of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','client/package.json','client/brand.json','web-api/package.json','client/electron/test.cjs']){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),'{}');}
  await mkdir(join(dir,'client/patches'),{recursive:true});await mkdir(join(dir,'client/scripts'),{recursive:true});await writeFile(join(dir,'client/scripts/verify-agent-tools.cjs'),'');
  const helper=join(dir,'client/vendor/openxml-tools',`${process.platform}-${process.arch}`,'openxmlhelper');await mkdir(dirname(helper),{recursive:true});await writeFile(helper,'fixture');
  const bin=join(dir,'bin'),calls=join(dir,'calls');await mkdir(bin);await writeFile(join(bin,'git'),"#!/bin/sh\nprintf 'client/electron/test.cjs\\0'\n",{mode:0o755});
  const listing=JSON.stringify([{dependencies:{unknown:{version:'1.0.0',resolved:'https://example.invalid/unverified.tgz'}}}]);await writeFile(join(bin,'pnpm'),`#!/bin/sh\nprintf '%s\\n' "$*" >> "$TEST_PNPM_CALLS"\nprintf '%s\\n' '${listing}'\n`,{mode:0o755});
  const env={...process.env,PATH:`${bin}:${process.env.PATH}`,TEST_PNPM_CALLS:calls};delete env.npm_execpath;const output=join(dir,'out'),result=spawnSync(process.execPath,[join(dir,'runner/build.mjs'),'--prepare-cache','--output',output],{encoding:'utf8',env,timeout:10000});
  assert.notEqual(result.status,0);assert.match(result.stderr,/fuente sin fecha verificable/);assert.doesNotMatch(await readFile(calls,'utf8'),/deploy/);await assert.rejects(readFile(join(output,'manifest.json')),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
