import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { runnerProjectCapture } from '../src/project-capture-route.js';

test('captura solo los recursos de plan de la cuenta y detecta cambios en R2', async () => {
  const worker = new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'plan-assets'},r2Buckets:['FILES']}));
  try {
    const DB = await worker.getD1Database('DB'), FILES = await worker.getR2Bucket('FILES');
    for (const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()) for (const sql of (await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean)) await DB.prepare(sql).run();
    await DB.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();
    await DB.prepare('INSERT INTO projects (id,owner_id,title,created_at) VALUES (?,?,?,?)').bind('p','alice','Proyecto','2026').run();
    const bytes = Buffer.from([137,80,78,71,13,10,26,10]), hash = createHash('sha256').update(bytes).digest('hex'), ref='agent-image.png';
    await FILES.put('private-asset-key',bytes);
    await DB.prepare('INSERT INTO project_plan_assets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind('asset-id','alice','p','req','source',ref,'agent',hash,'image/png',bytes.length,'private-asset-key','mutation','2026').run();
    const env={DB,FILES}, runner={ownerId:'alice'}, base='http://localhost/api/runner/project-captures/p';
    const response = await runnerProjectCapture(new Request(base),env,runner,'p');
    const snapshot = await response.json();
    assert.equal(snapshot.assets.length,1); assert.equal(snapshot.assets[0].reference,ref); assert.equal(snapshot.assets[0].content_hash,hash);
    assert.doesNotMatch(JSON.stringify(snapshot),/private-asset-key/);
    const asset=snapshot.assets[0], url=`${base}/assets/asset-id?etag=${encodeURIComponent(asset.etag)}&version=${asset.version}`;
    const object = await runnerProjectCapture(new Request(url),env,runner,'p','asset-id','assets');
    assert.deepEqual(Buffer.from(await object.arrayBuffer()),bytes);
    await FILES.put('private-asset-key',Buffer.from('changed!'));
    assert.equal((await runnerProjectCapture(new Request(url),env,runner,'p','asset-id','assets')).status,409);
    assert.equal((await runnerProjectCapture(new Request(url),env,{ownerId:'bob'},'p','asset-id','assets')).status,404);
  } finally { await worker.dispose(); }
});
