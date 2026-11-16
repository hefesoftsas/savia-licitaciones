import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadJobArtifact } from '../src/job-artifacts.js';

test('un fallo de R2 oculta el archivo y conserva la clave hasta completar el reintento', async () => {
  const row = { object_key: 'job-artifacts/fixture', deleted_at: null, storage_deleted_at: null };
  let fails = true, attempts = 0;
  const env = {
    BETTER_AUTH_URL: 'https://savia.example',
    DB: { prepare(sql) { return { bind(...values) { return {
      async first() {
        if (sql.startsWith('SELECT state')) return { state: 'succeeded' };
        if (sql.startsWith('UPDATE job_artifacts SET deleted_at')) { row.deleted_at ||= values[0]; return { object_key: row.object_key, storage_deleted_at: row.storage_deleted_at }; }
        if (sql.startsWith('SELECT a.object_key')) return row.deleted_at ? null : { object_key: row.object_key };
        throw new Error(`Unexpected query: ${sql}`);
      },
      async run() { if (!sql.startsWith('UPDATE job_artifacts SET storage_deleted_at')) throw new Error(`Unexpected query: ${sql}`); row.storage_deleted_at ||= values[0]; },
    }; } }; } },
    FILES: { async delete(key) { attempts++; assert.equal(key, row.object_key); if (fails) throw new Error('R2 no disponible'); }, async get() { throw new Error('No debe leer un archivo eliminado'); } },
  };
  const remove = () => downloadJobArtifact(new Request('https://savia.example/api/file', { method: 'DELETE', headers: { origin: 'https://savia.example' } }), env, 'owner', 'project', 'job');
  const failed = await remove(); assert.equal(failed.status, 503); assert.equal((await failed.json()).error, 'artifact_cleanup_pending');
  assert.ok(row.deleted_at); assert.equal(row.storage_deleted_at, null);
  const download = await downloadJobArtifact(new Request('https://savia.example/api/file'), env, 'owner', 'project', 'job'); assert.equal(download.status, 404);
  fails = false; assert.equal((await remove()).status, 204); assert.ok(row.storage_deleted_at); assert.equal(attempts, 2);
  assert.equal((await remove()).status, 204); assert.equal(attempts, 2);
});

test('si falla la eliminación del informe mantiene la tarea pendiente y permite reintentar',async()=>{
 const document={object_key:'document',deleted_at:null,storage_deleted_at:null},report={object_key:'report',deleted_at:null,storage_deleted_at:null};let reportFails=true;
 const env={BETTER_AUTH_URL:'https://savia.example',DB:{prepare(sql){return {bind(...values){return {async first(){if(sql.startsWith('SELECT state'))return {state:'succeeded',kind:'blind-check.fix-report'};if(sql.startsWith('UPDATE job_artifacts SET deleted_at')){document.deleted_at||=values[0];return {...document};}if(sql.startsWith('UPDATE job_repair_reports SET deleted_at')){report.deleted_at||=values[0];return {...report};}throw Error(sql);},async run(){if(sql.startsWith('UPDATE job_artifacts SET storage_deleted_at'))document.storage_deleted_at||=values[0];else if(sql.startsWith('UPDATE job_repair_reports SET storage_deleted_at'))report.storage_deleted_at||=values[0];else throw Error(sql);}};}};}},FILES:{async delete(key){if(key==='report'&&reportFails)throw Error('R2');}}};
 const remove=()=>downloadJobArtifact(new Request('https://savia.example/api/file',{method:'DELETE',headers:{origin:'https://savia.example'}}),env,'owner','project','job');
 assert.equal((await remove()).status,503);assert.ok(document.deleted_at);assert.equal(document.storage_deleted_at,null);assert.ok(report.deleted_at);reportFails=false;assert.equal((await remove()).status,204);assert.ok(document.storage_deleted_at);assert.ok(report.storage_deleted_at);
});
