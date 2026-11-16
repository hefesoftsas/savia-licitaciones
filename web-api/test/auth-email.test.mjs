import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createAuth } from '../src/auth.js';

test('Better Auth envía verificación y recuperación sin filtrar cuentas ni conservar sesiones anteriores', async () => {
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'auth-email'}}));
 try {
  const DB=await worker.getD1Database('DB'), messages=[];
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()) for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean)) await DB.prepare(sql).run();
  const auth=createAuth({DB,BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost',AUTH_EMAIL_FROM:'savia@example.com',AUTH_REQUIRE_VERIFIED_EMAIL:'true',EMAIL:{send:async message=>{messages.push(message);}}});
  const req=(path,body)=>auth.handler(new Request(`http://localhost/api/auth/${path}`,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(body)}));
  let res=await req('sign-up/email',{name:'Alice',email:'alice@example.com',password:'password-123456'});assert.equal(res.status,200,await res.clone().text());
  assert.equal(messages.length,1);assert.equal(messages[0].to,'alice@example.com');
  assert.equal((await req('sign-in/email',{email:'alice@example.com',password:'password-123456'})).status,403);
  const verify=messages[0].text.match(/https?:\/\/\S+/)[0];assert.equal((await auth.handler(new Request(verify))).status,302);
  res=await req('sign-in/email',{email:'alice@example.com',password:'password-123456'});assert.equal(res.status,200);const cookie=res.headers.get('set-cookie').split(';')[0];
  const before=messages.length;res=await req('request-password-reset',{email:'nobody@example.com',redirectTo:'/reset-password'});assert.equal(res.status,200);assert.equal(messages.length,before);
  res=await req('request-password-reset',{email:'alice@example.com',redirectTo:'/reset-password'});assert.equal(res.status,200);assert.equal(messages.length,before+1);
  const resetLink=messages.at(-1).text.match(/https?:\/\/\S+/)[0];res=await auth.handler(new Request(resetLink));assert.equal(res.status,302);const token=new URL(res.headers.get('location')).searchParams.get('token');assert.ok(token);
  assert.equal((await req('reset-password',{token,newPassword:'new-password-123'})).status,200);
  assert.equal((await req('reset-password',{token,newPassword:'other-password-123'})).status,400);
  assert.equal((await auth.api.getSession({headers:new Headers({cookie})})),null);
  assert.notEqual((await req('sign-in/email',{email:'alice@example.com',password:'password-123456'})).status,200);
  assert.equal((await req('sign-in/email',{email:'alice@example.com',password:'new-password-123'})).status,200);
  await req('request-password-reset',{email:'alice@example.com',redirectTo:'/reset-password'});
  const expiredLink=messages.at(-1).text.match(/https?:\/\/\S+/)[0];
  await DB.prepare("UPDATE verification SET expiresAt=0 WHERE identifier LIKE 'reset-password:%'").run();
  const expired=await auth.handler(new Request(expiredLink));assert.equal(expired.status,302);assert.equal(new URL(expired.headers.get('location')).searchParams.get('error'),'INVALID_TOKEN');
 } finally {await worker.dispose();}
});

test('no permite habilitar verificación sin correo configurado',()=>{
 assert.throws(()=>createAuth({AUTH_REQUIRE_VERIFIED_EMAIL:'true'}),/correo/i);
});

test('una sesión anterior sin verificar no accede a datos al activar verificación',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'auth-old-session'}}));
 try {
  const DB=await worker.getD1Database('DB');
  for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  const env={DB,BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost'};
  const auth=createAuth(env),signup=await auth.handler(new Request('http://localhost/api/auth/sign-up/email',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({name:'Alice',email:'alice@example.com',password:'password-123456'})}));
  assert.equal(signup.status,200);const cookie=signup.headers.get('set-cookie').split(';')[0];
  const app=(await import('../src/index.js')).default,request=()=>new Request('http://localhost/api/me',{headers:{cookie}});
  assert.equal((await app.fetch(request(),env)).status,200);
  const caps=await app.fetch(new Request('http://localhost/api/auth-capabilities'),{...env,AUTH_EMAIL_FROM:' ',EMAIL:{send:async()=>{}}});assert.equal((await caps.json()).email,false);
  const secureEnv={...env,AUTH_REQUIRE_VERIFIED_EMAIL:'true',AUTH_EMAIL_FROM:'savia@example.com',EMAIL:{send:async()=>{}}};
  assert.equal((await app.fetch(request(),secureEnv)).status,403);
  const {digest,authenticateRunner}=await import('../src/runners.js'), token='a'.repeat(64),user=await DB.prepare('SELECT id FROM "user" WHERE email=?').bind('alice@example.com').first();
  await DB.prepare('INSERT INTO runners(id,owner_id,name,token_hash,created_at) VALUES(?,?,?,?,?)').bind('r',user.id,'runner',await digest(token),'2026').run();
  const runnerRequest=new Request('http://localhost/api/runner/jobs/claim',{headers:{authorization:`Bearer ${token}`}});
  assert.equal(await authenticateRunner(runnerRequest,secureEnv),null);
  const {handleRunnerAgent}=await import('../src/runners.js');
  const heartbeat=()=>new Request('http://localhost/api/runners/heartbeat',{method:'POST',headers:{authorization:`Bearer ${token}`}});
  assert.equal((await handleRunnerAgent(heartbeat(),secureEnv)).status,401);
  const code='b'.repeat(64);await DB.prepare('INSERT INTO runner_pairings(id,owner_id,code_hash,expires_at,used_at) VALUES(?,?,?,?,NULL)').bind('pair',user.id,await digest(code),Date.now()+60000).run();
  const pair=()=>new Request('http://localhost/api/runners/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'runner',code})});
  assert.equal((await handleRunnerAgent(pair(),secureEnv)).status,401);
  await DB.prepare('UPDATE "user" SET emailVerified=1 WHERE id=?').bind(user.id).run();
  assert.equal((await authenticateRunner(runnerRequest,secureEnv)).ownerId,user.id);
  assert.equal((await handleRunnerAgent(heartbeat(),secureEnv)).status,200);
  assert.equal((await handleRunnerAgent(pair(),secureEnv)).status,201);
 }finally{await worker.dispose();}
});
