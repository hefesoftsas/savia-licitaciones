import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isSupportedTextCredential,textProviderConfig} from '../text-provider.mjs';

test('selecciona Kimi China explícitamente con destino fijo y límites del cliente',()=>{
 const credential={provider:'moonshot-cn-api',model:'kimi-k2-thinking',secret:'fixture',contextTokens:128000,outputTokens:8192};assert.equal(isSupportedTextCredential(credential),true);const config=textProviderConfig(credential);assert.equal(config.base_url,'https://api.moonshot.cn/v1');assert.equal(config.web_runner_moonshot_native,true);assert.equal(config.context_length_limit,128000);assert.equal(config.output_token_limit,8192);
 assert.equal(textProviderConfig({...credential,provider:'moonshot-api'}).base_url,'https://api.moonshot.ai/v1');
});
