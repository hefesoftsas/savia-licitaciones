// The gate deliberately keeps abandoned leases: an interrupted request must
// prevent a backup rather than let an operator mistake it for a drained one.
export class BackupGate {
  constructor(state){this.state=state;}
  async fetch(request){
    if(request.method!=='POST')return new Response(null,{status:405});
    let input;try{input=await request.json();}catch{return new Response(null,{status:400});}
    return this.state.blockConcurrencyWhile(async()=>{
      const data=await this.state.storage.get('gate')||{locked:false,nonce:null,leases:{}};
      const path=new URL(request.url).pathname;
      if(path==='/acquire'){
        if(data.locked)return Response.json({error:'maintenance'},{status:503});
        if(typeof input.id!=='string'||!input.id)return new Response(null,{status:400});
        data.leases[input.id]=true;await this.state.storage.put('gate',data);return Response.json({ok:true});
      }
      if(path==='/release'){
        delete data.leases[input.id];await this.state.storage.put('gate',data);return Response.json({ok:true});
      }
      if(path==='/status')return Response.json({locked:data.locked,owned:data.locked&&data.nonce===input.nonce,active:Object.keys(data.leases).length});
      if(path==='/lock'){
        if(typeof input.nonce!=='string'||!input.nonce)return new Response(null,{status:400});
        if(data.locked&&data.nonce!==input.nonce)return new Response(null,{status:409});
        data.locked=true;data.nonce=input.nonce;await this.state.storage.put('gate',data);
        return Response.json({locked:true,active:Object.keys(data.leases).length});
      }
      if(path==='/unlock'){
        if(!data.locked||data.nonce!==input.nonce)return new Response(null,{status:409});
        data.locked=false;data.nonce=null;await this.state.storage.put('gate',data);return Response.json({locked:false});
      }
      return new Response(null,{status:404});
    });
  }
}

export async function withBackupGate(request,env,handler){
  const path=new URL(request.url).pathname;
  const control=path.startsWith('/api/_backup/');
  const enabled=env.BACKUP_GATE_ENABLED==='true';
  if(control&&(!env.BACKUP_CONTROL_TOKEN||request.headers.get('authorization')!==`Bearer ${env.BACKUP_CONTROL_TOKEN}`))return new Response(null,{status:401});
  if(!enabled)return control?new Response(null,{status:503}):handler();
  if(!env.BACKUP_GATE)return new Response(null,{status:503});
  const stub=env.BACKUP_GATE.get(env.BACKUP_GATE.idFromName('account'));
  const call=(action,body)=>stub.fetch(`https://backup-gate.invalid/${action}`,{method:'POST',body:JSON.stringify(body)});
  if(control){
    if(request.method!=='POST')return new Response(null,{status:405});
    const action=path.slice('/api/_backup/'.length);
    if(!['lock','status','unlock'].includes(action))return new Response(null,{status:404});
    let data;try{data=await request.json();}catch{return new Response(null,{status:400});}
    return call(action,data);
  }
  const id=crypto.randomUUID();
  const acquired=await call('acquire',{id});
  if(!acquired.ok)return Response.json({error:'maintenance'},{status:503,headers:{'retry-after':'30'}});
  try{return await handler();}finally{await call('release',{id});}
}
