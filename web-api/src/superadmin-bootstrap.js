import {hashPassword} from 'better-auth/crypto';
import {ensureUserTenant} from './tenant-scope.js';
export async function bootstrapSuperadmin(env){
 const configured=env.SAVIA_SUPERADMIN_EMAIL!==undefined||env.SAVIA_SUPERADMIN_PASSWORD!==undefined||env.SAVIA_SUPERADMIN_NAME!==undefined;if(!configured)return;
 const existing=await env.DB.prepare('SELECT slot,user_id FROM auth_superadmin_bootstrap WHERE slot=1').first();if(existing){await ensureUserTenant(env,existing.user_id);return;}
 const email=typeof env.SAVIA_SUPERADMIN_EMAIL==='string'?env.SAVIA_SUPERADMIN_EMAIL.trim().toLowerCase():'',password=env.SAVIA_SUPERADMIN_PASSWORD,name=typeof env.SAVIA_SUPERADMIN_NAME==='string'?env.SAVIA_SUPERADMIN_NAME.trim():'Superadministrador';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length<8||password.length>128||!name||name.length>300)throw new Error('Invalid superadmin bootstrap configuration');
 const userId=crypto.randomUUID(),accountId=crypto.randomUUID(),now=Date.now(),passwordHash=await hashPassword(password);
 await env.DB.batch([
  env.DB.prepare('INSERT INTO "user"(id,name,email,"emailVerified",image,"createdAt","updatedAt",role,banned) SELECT ?,?,?,1,NULL,?,?,?,0 WHERE NOT EXISTS(SELECT 1 FROM auth_superadmin_bootstrap WHERE slot=1) AND NOT EXISTS(SELECT 1 FROM "user" WHERE lower(email)=?)').bind(userId,name,email,now,now,'superadmin',email),
  env.DB.prepare('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") SELECT ?,?,\'credential\',?,?,?,? WHERE EXISTS(SELECT 1 FROM "user" WHERE id=?)').bind(accountId,userId,userId,passwordHash,now,now,userId),
  env.DB.prepare('INSERT INTO auth_superadmin_bootstrap(slot,user_id,created_at) SELECT 1,?,? WHERE EXISTS(SELECT 1 FROM "user" WHERE id=?) ON CONFLICT(slot) DO NOTHING').bind(userId,now,userId),
 ]);
 const bootstrapped=await env.DB.prepare('SELECT user_id FROM auth_superadmin_bootstrap WHERE slot=1').first();
 if(!bootstrapped)throw new Error('Superadmin bootstrap cannot claim an existing account');
 await ensureUserTenant(env,bootstrapped.user_id);
}
