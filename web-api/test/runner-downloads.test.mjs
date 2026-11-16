import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runnerDownloads} from '../src/runner-downloads.js';
test('ofrece únicamente instaladores configurados con HTTPS',async()=>{
 assert.deepEqual(await runnerDownloads({}).json(),{downloads:{}});
 assert.deepEqual(await runnerDownloads({RUNNER_DOWNLOAD_WINDOWS_URL:'https://downloads.example/Savia.exe',RUNNER_DOWNLOAD_MACOS_URL:'https://downloads.example/Savia.dmg'}).json(),{downloads:{windows:'https://downloads.example/Savia.exe',macos:'https://downloads.example/Savia.dmg'}});
 assert.deepEqual(await runnerDownloads({RUNNER_DOWNLOAD_WINDOWS_URL:'javascript:alert(1)',RUNNER_DOWNLOAD_MACOS_URL:'https://user:password@example/file'}).json(),{downloads:{}});
});
test('separa los instaladores de Mac Intel y Apple Silicon',async()=>{
 const data=await runnerDownloads({RUNNER_DOWNLOAD_MACOS_ARM64_URL:'https://downloads.example/arm64.dmg',RUNNER_DOWNLOAD_MACOS_X64_URL:'https://downloads.example/x64.dmg'}).json();
 assert.equal(data.downloads['macos-arm64'],'https://downloads.example/arm64.dmg');
 assert.equal(data.downloads['macos-x64'],'https://downloads.example/x64.dmg');
 assert.equal(data.downloads.macos,undefined);
});
test('permite HTTP loopback solo en la vista previa local',async()=>{
 const env={RUNNER_DOWNLOAD_MACOS_ARM64_URL:'http://127.0.0.1:8789/Savia.dmg'};
 assert.deepEqual((await runnerDownloads(env).json()).downloads,{});
 assert.deepEqual((await runnerDownloads(env,'https://savia.example/api/runner-downloads').json()).downloads,{});
 assert.equal((await runnerDownloads(env,'http://127.0.0.1:8788/api/runner-downloads').json()).downloads['macos-arm64'],env.RUNNER_DOWNLOAD_MACOS_ARM64_URL);
 assert.deepEqual((await runnerDownloads({RUNNER_DOWNLOAD_WINDOWS_URL:'http://remote.example/file.exe'},'http://localhost:8788/').json()).downloads,{});
});
