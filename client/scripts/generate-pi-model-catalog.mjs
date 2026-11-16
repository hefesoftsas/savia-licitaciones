import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const client = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const {MODELS} = await import(pathToFileURL(resolve(client, 'node_modules/@earendil-works/pi-ai/dist/models.generated.js')).href);
const providers = {'opencode-zen':'opencode','ant-ling-api':'ant-ling','anthropic-api':'anthropic','cerebras-api':'cerebras','deepseek-api':'deepseek','fireworks-api':'fireworks','google-api':'google','google-vertex-api':'google-vertex','huggingface-api':'huggingface','groq-api':'groq','minimax-api':'minimax','minimax-cn-api':'minimax-cn','mistral-api':'mistral','moonshot-api':'moonshotai','moonshot-cn-api':'moonshotai-cn','nvidia-api':'nvidia','opencode-go':'opencode-go','openai-api':'openai','together-api':'together','xai-api':'xai','xiaomi-api':'xiaomi','zai-api':'zai'};
const compare = (a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const catalog = Object.fromEntries(Object.entries(providers).map(([id, provider]) => [id, Object.values(MODELS[provider]).filter(model => (!['minimax','minimax-cn'].includes(provider) || model.id.startsWith('MiniMax-M3')) && (provider !== 'xiaomi' || !['mimo-v2.5','mimo-v2.5-pro'].includes(model.id)) && model.input.includes('text') && Number.isSafeInteger(model.contextWindow) && model.contextWindow >= 1024 && model.contextWindow <= 2000000 && Number.isSafeInteger(model.maxTokens) && model.maxTokens > 0 && model.maxTokens <= model.contextWindow).map(model => ({id:model.id,name:model.name,contextTokens:model.contextWindow,outputTokens:model.maxTokens})).sort(compare)]));
const output = `${JSON.stringify(catalog, null, 2)}\n`;
const path = resolve(client, 'src/features/web/pi-model-catalog.json');
if (process.argv.includes('--check')) {
  const current = await readFile(path, 'utf8').catch(() => '');
  if (current !== output) { console.error('El catálogo Pi cambió; ejecuta node scripts/generate-pi-model-catalog.mjs desde client/.'); process.exitCode = 1; }
} else await writeFile(path, output, 'utf8');
