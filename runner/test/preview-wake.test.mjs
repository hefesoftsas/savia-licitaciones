import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewWake,connectPreviewWake} from '../preview-wake.mjs';

test('a preview notification wakes an idle runner without losing early notifications', async()=>{
 const wake=createPreviewWake();
 const first=wake.wait(10000);
 wake.notify();
 assert.equal(await first,'notification');
 wake.notify();
 assert.equal(await wake.wait(10000),'notification');
 assert.equal(await wake.wait(5),'timeout');
 wake.close();
});

test('a disconnected notification channel leaves the regular polling timeout usable',async()=>{
 const wake=createPreviewWake(),controller=new AbortController();
 class OfflineSocket extends EventTarget { close(){} }
 connectPreviewWake({server:'http://localhost',token:'test',wake,signal:controller.signal,WebSocketClass:OfflineSocket});
 assert.equal(await wake.wait(10),'timeout');
 const waiting=wake.wait(10000);controller.abort();assert.equal(await waiting,'closed');
});

test('the preview socket authenticates to Access using the runner service credentials',()=>{
 const wake=createPreviewWake(), controller=new AbortController(); let options;
 class Socket extends EventTarget { constructor(url, value){ super(); options=value; } close(){} }
 connectPreviewWake({server:'https://savia.example',token:'runner',cloudflareAccess:{clientId:'id',clientSecret:'secret'},wake,signal:controller.signal,WebSocketClass:Socket});
 assert.equal(options.headers.authorization,'Bearer runner');
 assert.equal(options.headers['CF-Access-Client-Id'],'id');
 assert.equal(options.headers['CF-Access-Client-Secret'],'secret');
 controller.abort();
});
