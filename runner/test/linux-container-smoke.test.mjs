import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';import {isAbsolute,join} from 'node:path';
const root=fileURLToPath(new URL('../..',import.meta.url)),context=fileURLToPath(new URL('./fixtures/linux',import.meta.url));
for(const [name,platform] of [['arm64','linux/arm64'],['x64','linux/amd64']])test(`Linux ${name}: Pi simulado y exportación Word real`,{skip:process.env.SAVIA_TEST_LINUX_DOCKER!=='1',timeout:180000},()=>{
 const image=`savia-linux-smoke:${randomUUID()}`,deps=process.env[`SAVIA_TEST_LINUX_DEPS_${name.toUpperCase()}`],common=['run','--rm','--network','none','--read-only','--tmpfs','/tmp:rw,exec','--platform',platform,'--mount',`type=bind,src=${root},dst=/savia,readonly`];
 if(deps){assert.ok(isAbsolute(deps),'La ruta de dependencias debe ser absoluta.');common.push('--mount',`type=bind,src=${join(deps,'node_modules')},dst=/savia/node_modules,readonly`,'--mount',`type=bind,src=${join(deps,'client/node_modules')},dst=/savia/client/node_modules,readonly`);}
 common.push('--workdir','/savia','--env','SAVIA_HEADLESS_RUNNER=1');
 const run=(args,timeout=60000)=>{const output=execFileSync('docker',[...common,...args],{encoding:'utf8',timeout});assert.match(output,/# fail 0/);return output;};
 try{
  execFileSync('docker',['build','--platform',platform,'--network','none','--tag',image,context],{stdio:'pipe',timeout:120000});
  assert.match(run([image,'node','--test','--test-name-pattern=usa el transporte OpenCode Go existente','runner/test/tender-chat.test.mjs']),/# pass 1/);
  assert.match(run(['--env','SAVIA_TEST_LINUX_WORD=1',image,'node','--test','runner/test/linux-word-export.test.mjs']),/# pass 1/);
  if(deps){
   assert.match(run(['--env','SAVIA_TEST_OPENXML=1',image,'node','--test','--test-name-pattern=el runner convierte capítulos','runner/test/technical-plan-export.test.mjs']),/# pass 1/);
   assert.match(run(['--env','SAVIA_TEST_LINUX_DEPS=1',image,'node','--test','runner/test/linux-dependencies.test.mjs']),/# pass 2/);
   assert.match(run([image,'node','--test','--test-name-pattern=inspecciona planes activos e inactivos','runner/test/desktop-backup.test.mjs']),/# pass 1/);
  }
 }finally{spawnSync('docker',['image','rm',image],{stdio:'ignore'});}
});
