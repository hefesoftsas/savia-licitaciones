import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deleteRepairReport} from '../src/repair-reports.js';
test('conserva la clave del informe si falla R2 y permite completar la eliminación',async()=>{
 const row={object_key:'report/key',deleted_at:null,storage_deleted_at:null};let fails=true,calls=0;
 const env={DB:{prepare(sql){return {bind(...values){return {async first(){assert.match(sql,/UPDATE job_repair_reports SET deleted_at/);row.deleted_at||=values[0];return {...row};},async run(){assert.match(sql,/UPDATE job_repair_reports SET storage_deleted_at/);row.storage_deleted_at||=values[0];}};}};}},FILES:{async delete(key){calls++;assert.equal(key,row.object_key);if(fails)throw Error('R2');}}};
 assert.equal(await deleteRepairReport(env,'job'),false);assert.ok(row.deleted_at);assert.equal(row.storage_deleted_at,null);fails=false;assert.equal(await deleteRepairReport(env,'job'),true);assert.ok(row.storage_deleted_at);assert.equal(await deleteRepairReport(env,'job'),true);assert.equal(calls,2);
});
