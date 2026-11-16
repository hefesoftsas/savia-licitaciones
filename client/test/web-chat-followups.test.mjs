import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('muestra preguntas sugeridas solo para la última respuesta con los mismos documentos',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {WebChatFollowUps}=await server.ssrLoadModule('/src/features/web/WebChatFollowUps.tsx');
  const job={id:'a',kind:'tender-chat.send',state:'succeeded',payload:{fileIds:['one','two']},result:{answer:'Respuesta',followUps:['¿Qué plazo aplica?']}};
  const render=(overrides={})=>renderToStaticMarkup(React.createElement(WebChatFollowUps,{job,jobs:[job],selectedFiles:['two','one'],continueChat:true,busy:false,language:'es',onSelect(){},...overrides}));
  assert.match(render(),/¿Qué plazo aplica\?/);assert.match(render(),/Preguntas de seguimiento sugeridas/);
  assert.match(render({language:'en'}),/Suggested follow-up questions/);
  assert.equal(render({selectedFiles:['one']}),'');assert.equal(render({continueChat:false}),'');assert.equal(render({busy:true}),'');
  assert.equal(render({jobs:[{...job,id:'new',state:'running'},job]}),'');
  assert.equal(render({jobs:[{...job,id:'new'},job]}),'');
 }finally{await server.close();}
});
