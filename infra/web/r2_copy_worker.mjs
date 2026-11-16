import {createHash} from 'node:crypto';

async function hashBody(body){
 const hash=createHash('sha256');for await(const chunk of body)hash.update(chunk);return hash.digest('hex');
}

export default {async fetch(request,env){
 if(!env.COPY_SECRET||request.headers.get('authorization')!==`Bearer ${env.COPY_SECRET}`)return new Response(null,{status:401});
 if(request.method!=='POST')return new Response(null,{status:405});
 let body;try{body=await request.json();}catch{return new Response(null,{status:400});}
 const sourcePrefix=env.SOURCE_PREFIX||'',targetPrefix=env.TARGET_PREFIX||'';
 if(!sourcePrefix&&!targetPrefix)return new Response(null,{status:400});
 const action=new URL(request.url).pathname;
 if(action==='/target-empty'){
  const page=await env.TARGET.list({limit:1});return Response.json({empty:page.objects.length===0});
 }
 if(action==='/list'){
  const page=await env.SOURCE.list({prefix:sourcePrefix,limit:100,cursor:body.cursor||undefined});
  return Response.json({objects:page.objects.map(({key,size,version})=>({key,size,version})),cursor:page.truncated?page.cursor:null});
 }
 if(action!=='/copy')return new Response(null,{status:404});
 if(typeof body.key!=='string'||!body.key.startsWith(sourcePrefix)||typeof body.version!=='string')return new Response(null,{status:400});
 const object=await env.SOURCE.get(body.key);
 if(!object||object.version!==body.version||object.size!==body.size)return new Response(null,{status:409});
 const key=targetPrefix+body.key.slice(sourcePrefix.length);
 const hash=createHash('sha256');let put;
 const options={httpMetadata:object.httpMetadata,customMetadata:object.customMetadata,onlyIf:new Headers({'If-None-Match':'*'})};
 if(object.size===0){put=await env.TARGET.put(key,new Uint8Array(),options);}
 else{
  const fixed=new FixedLengthStream(object.size);
  const transform=new TransformStream({transform(chunk,controller){hash.update(chunk);controller.enqueue(chunk);}});
  const [result]=await Promise.all([env.TARGET.put(key,fixed.readable,options),object.body.pipeThrough(transform).pipeTo(fixed.writable)]);
  put=result;
 }
 if(!put)return new Response(null,{status:409});
 const originalHash=hash.digest('hex');
 const copied=await env.TARGET.get(key);const after=await env.SOURCE.head(body.key);
 if(!copied||copied.size!==object.size||!after||after.version!==object.version)return new Response(null,{status:409});
 const copiedHash=await hashBody(copied.body);
 if(copiedHash!==originalHash)return new Response(null,{status:409});
 return Response.json({size:object.size,sha256:originalHash});
}};
