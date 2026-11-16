import {createRequire} from 'node:module';
import {accessHeaders} from './cloudflare-access.mjs';
const require=createRequire(new URL('../client/package.json',import.meta.url));
export function createPreviewWake(){
 let pending=false, waiter=null, closed=false;
 return {
  notify(){if(closed)return;if(waiter){const done=waiter;waiter=null;done('notification');}else pending=true;},
  wait(ms){if(closed)return Promise.resolve('closed');if(pending){pending=false;return Promise.resolve('notification');}return new Promise(resolve=>{const timer=setTimeout(()=>{waiter=null;resolve('timeout');},ms);waiter=value=>{clearTimeout(timer);resolve(value);};});},
  close(){closed=true;if(waiter){const done=waiter;waiter=null;done('closed');}},
 };
}
export function connectPreviewWake({server,token,cloudflareAccess,wake,signal,WebSocketClass}){
 const WebSocket=WebSocketClass||require('undici').WebSocket;
 let socket,retry,stopped=false;
 function connect(){if(stopped)return;const url=new URL('/api/runner/preview-wake',server);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  try{socket=new WebSocket(url,{headers:{authorization:`Bearer ${token}`,...accessHeaders(server,cloudflareAccess)}});
   socket.addEventListener('open',()=>wake.notify());
   socket.addEventListener('message',event=>{if(event.data==='preview')wake.notify();});
   socket.addEventListener('error',()=>{});
   socket.addEventListener('close',()=>{if(!stopped)retry=setTimeout(connect,5000);});
  }catch{if(!stopped)retry=setTimeout(connect,5000);}
 }
 function stop(){if(stopped)return;stopped=true;clearTimeout(retry);try{socket?.close();}catch{}wake.close();}
 signal?.addEventListener('abort',stop,{once:true});connect();return stop;
}
