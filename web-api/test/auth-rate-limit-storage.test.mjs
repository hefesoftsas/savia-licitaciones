import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createAuthRateLimitStorage} from '../src/auth-rate-limit.js';

test('mantiene el límite por ventana y limpia un lote de contadores antiguos',async()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec(await readFile(new URL('../migrations/0133_auth_rate_limit.sql',import.meta.url),'utf8'));
  const old='f'.repeat(64);db.prepare('INSERT INTO "rateLimit" VALUES (?,?,?,?)').run('old',old,1,1);
  const DB={prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async run(){return db.prepare(sql).run(...args);}};}};}};
  let time=2*24*60*60*1000;const storage=createAuthRateLimitStorage({DB,BETTER_AUTH_SECRET:'secreto-de-prueba-largo'},{now:()=>time,shouldCleanup:()=>true}),rule={window:10,max:2};
  assert.deepEqual(await storage.consume('192.0.2.10|/sign-in/email',rule),{allowed:true,retryAfter:null});assert.equal(db.prepare('SELECT id FROM "rateLimit" WHERE "key"=?').get(old),undefined);
  assert.deepEqual(await storage.consume('192.0.2.10|/sign-in/email',rule),{allowed:true,retryAfter:null});assert.deepEqual(await storage.consume('192.0.2.10|/sign-in/email',rule),{allowed:false,retryAfter:10});
  time+=10000;assert.deepEqual(await storage.consume('192.0.2.10|/sign-in/email',rule),{allowed:true,retryAfter:null});
 }finally{db.close();}
});

test('la migración retira los contadores anteriores en texto claro',async()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec(await readFile(new URL('../migrations/0133_auth_rate_limit.sql',import.meta.url),'utf8'));
  const insert=db.prepare('INSERT INTO "rateLimit" VALUES (?,?,?,?)');insert.run('old','192.0.2.10|/sign-in/email',1,1);insert.run('new','a'.repeat(64),1,1);
  db.exec(await readFile(new URL('../migrations/0134_auth_rate_limit_privacy.sql',import.meta.url),'utf8'));
  assert.deepEqual(db.prepare('SELECT id FROM "rateLimit"').all().map(row=>row.id),['new']);
 }finally{db.close();}
});
