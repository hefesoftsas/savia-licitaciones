export class PreviewWake {
 constructor(state){this.state=state;}
 async fetch(request){
  if(request.method==='POST'){for(const socket of this.state.getWebSockets()){try{socket.send('preview');}catch{}}return new Response(null,{status:204});}
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
  const pair=new WebSocketPair();this.state.acceptWebSocket(pair[1]);return new Response(null,{status:101,webSocket:pair[0]});
 }
 webSocketMessage(){}
 webSocketClose(socket,code,reason){socket.close(code,reason);}
 webSocketError(socket){try{socket.close(1011,'error');}catch{}}
}
export function previewWakeStub(env,owner){return env.PREVIEW_WAKE?.get(env.PREVIEW_WAKE.idFromName(owner));}
