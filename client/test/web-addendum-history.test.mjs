import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('muestra adendas históricas y sus citas como texto sin prometer vigencia',async()=>{
 const server=await createServer({configFile:resolve(root,'vite.web.config.ts'),root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
 try{const {AddendumHistoryView}=await server.ssrLoadModule('/src/features/web/WebAddendumHistory.tsx');const run={id:'r',status:'completed',sources:{addendumName:'Adenda 1'},result:{impacts:[{id:'i',title:'Cambio',addendumQuote:'<script>malicioso</script>'}]},reviews:[{impactId:'i',status:'reviewed',note:'Revisado en escritorio'}],orphanReviewCount:0,createdAt:'2026-01-01',historical:true};const html=renderToStaticMarkup(React.createElement(AddendumHistoryView,{runs:[run],language:'es'}));assert.match(html,/histórico/i);assert.match(html,/Revisado en escritorio/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/no se ha comprobado/i);const broken=renderToStaticMarkup(React.createElement(AddendumHistoryView,{runs:[{id:'bad',status:'interrupted',sources:null,result:null,reviews:[],issue:'invalid_json',historical:true}],language:'en'}));assert.match(broken,/interrupted/i);assert.match(broken,/unreadable/i);}finally{await server.close();}
});
