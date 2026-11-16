const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const retentionMs = 24 * 60 * 60 * 1000;

// The key supplied by Better Auth includes the client IP and path. Persist only
// a keyed digest, and update the shared counter in a single D1 statement.
export function createAuthRateLimitStorage(env, {now=Date.now,shouldCleanup=()=>crypto.getRandomValues(new Uint8Array(1))[0]===0}={}) {
  const secret = env.BETTER_AUTH_SECRET;
  let signingKey;
  return {async consume(key, rule) {
    if(typeof secret!=='string'||!secret)throw new Error('Falta el secreto de autenticación.');
    signingKey ||= crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const digest=hex(await crypto.subtle.sign('HMAC',await signingKey,encoder.encode(`savia-auth-rate-v1:${key}`)));
    const time=now(),cutoff=time-rule.window*1000;
    const changed=await env.DB.prepare(`INSERT INTO "rateLimit" (id,"key",count,"lastRequest") VALUES (?,?,1,?)
      ON CONFLICT("key") DO UPDATE SET count=CASE WHEN "lastRequest"<=? THEN 1 ELSE count+1 END,"lastRequest"=?
      WHERE "lastRequest"<=? OR count<? RETURNING count`).bind(crypto.randomUUID(),digest,time,cutoff,time,cutoff,rule.max).first();
    let result;
    if(changed)result={allowed:true,retryAfter:null};
    else {
      const current=await env.DB.prepare('SELECT "lastRequest" FROM "rateLimit" WHERE "key"=?').bind(digest).first();
      result={allowed:false,retryAfter:Math.max(1,Math.ceil(((current?.lastRequest??time)+rule.window*1000-time)/1000))};
    }
    if(shouldCleanup())try{await env.DB.prepare('DELETE FROM "rateLimit" WHERE "key" IN (SELECT "key" FROM "rateLimit" WHERE "lastRequest"<? ORDER BY "lastRequest" LIMIT 100)').bind(time-retentionMs).run();}catch{/* Cleanup does not decide whether authentication is allowed. */}
    return result;
  }};
}
