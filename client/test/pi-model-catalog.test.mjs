import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('la instantánea corresponde al catálogo Pi instalado y solo contiene proveedores habilitados',async()=>{
 execFileSync(process.execPath,['scripts/generate-pi-model-catalog.mjs','--check'],{cwd:root,stdio:'pipe'});
 const catalog=JSON.parse(await readFile(resolve(root,'src/features/web/pi-model-catalog.json'),'utf8'));
 assert.ok(catalog['fireworks-api'].some(model=>model.id==='accounts/fireworks/models/glm-5p2'));
 assert.ok(catalog['opencode-go'].length>0);
 assert.deepEqual(Object.keys(catalog).sort(),['ant-ling-api','anthropic-api','cerebras-api','deepseek-api','fireworks-api','google-api','google-vertex-api','groq-api','huggingface-api','minimax-api','minimax-cn-api','mistral-api','moonshot-api','moonshot-cn-api','nvidia-api','opencode-go','opencode-zen','openai-api','together-api','xai-api','xiaomi-api','zai-api'].sort());
 assert.ok(catalog['minimax-cn-api'].some(model=>model.id==='MiniMax-M3'));
 assert.ok(catalog['xiaomi-api'].length>0);assert.ok(!catalog['xiaomi-api'].some(model=>['mimo-v2.5','mimo-v2.5-pro'].includes(model.id)));
 for(const models of Object.values(catalog)) for(const model of models) {
  assert.deepEqual(Object.keys(model).sort(),['contextTokens','id','name','outputTokens']);
  assert.ok(model.contextTokens>=1024 && model.outputTokens>0 && model.outputTokens<=model.contextTokens);
 }
});
