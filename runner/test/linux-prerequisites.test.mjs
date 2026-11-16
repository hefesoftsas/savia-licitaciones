import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
for(const [arch,platform] of [['arm64','linux/arm64'],['x64','linux/amd64']]) test(`prerrequisitos Linux ${arch} ejecutan herramientas y helper`,{skip:process.env.SAVIA_TEST_LINUX_DOCKER!=='1',timeout:60000},()=>{
 const script=`set -eu
/savia/client/vendor/agent-tools/linux-${arch}/bin/rg --version
/savia/client/vendor/agent-tools/linux-${arch}/bin/fd --version
/savia/client/vendor/agent-tools/linux-${arch}/bin/jq -n 1+1
mkdir -p /tmp/work/openxml-jobs/smoke
printf '%s\\n' '{"action":"ping"}' > /tmp/work/openxml-jobs/smoke/request.json
printf '%s\\n' '{"v":1,"type":"run","job":"smoke"}' | /savia/client/vendor/openxml-tools/linux-${arch}/openxmlhelper --workspace /tmp/work
cat /tmp/work/openxml-jobs/smoke/result.json`;
 const output=execFileSync('docker',['run','--rm','-i','--network','none','--read-only','--tmpfs','/tmp:rw,exec','--platform',platform,'--entrypoint','/bin/sh','--mount',`type=bind,src=${root},dst=/savia,readonly`,'mcr.microsoft.com/dotnet/runtime-deps@sha256:62028293921f5bd6db3d9f9119cd29cd926dfd3c2336da23b09f425e40c3c832','-c',script],{encoding:'utf8',timeout:55000});
 assert.match(output,/ripgrep 14\.1\.1/);assert.match(output,/fd 10\.3\.0/);assert.match(output,/\n2\n/);assert.match(output,/"type":"done","job":"smoke","ok":true/);assert.match(output,/"action"\s*:\s*"ping"/);
});
