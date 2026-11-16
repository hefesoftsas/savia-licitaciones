import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleUserCredentials} from '../src/credentials.js';
import {isSupportedTextCredential,textProviderConfig} from '../../runner/text-provider.mjs';

test('los planes de programación no verificados no se pueden guardar ni ejecutar como API de producto',async()=>{
 for(const provider of ['kimi-coding','zai-coding-cn','zai-coding']){
  const credential={provider,model:'fixture-model',secret:'fixture-secret'};
  const request=new Request('http://localhost/api/provider-credentials',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(credential)});
  const response=await handleUserCredentials(request,{BETTER_AUTH_URL:'http://localhost',DB:{prepare(){throw new Error('No debe acceder a la base.');}}},'owner');
  assert.equal(response.status,400);assert.equal((await response.json()).error,'invalid_credential');assert.equal(isSupportedTextCredential(credential),false);assert.throws(()=>textProviderConfig(credential),/Unsupported/);
 }
});
