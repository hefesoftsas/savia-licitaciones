import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFile,readdir} from 'node:fs/promises';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {importDesktopComparison} from '../src/desktop-comparison-import.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('importa comparaciones distintas del mismo requisito sin duplicarlas',async()=>{
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-10-30',d1Databases:{DB:'comparison-restore'}}));
 try{const DB=await worker.getD1Database('DB');for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL(`../migrations/${f}`,import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await DB.prepare(sql).run();
  await DB.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,0,0)').bind('alice','Alice','alice@example.com').run();await DB.prepare('INSERT INTO projects VALUES(?,?,?,?)').bind('p','alice','Proyecto','2026').run();await DB.prepare('INSERT INTO desktop_plan_imports VALUES(?,?,?,?,?,?)').bind('alice','req','hash','p','mutation','2026').run();
  const snapshot={requirementId:'requirement',factId:'fact',label:'Indicador',value:'1',page:1,title:'Requisito',source:'pliego',operator:'>=',threshold:'1',interpretedValue:'1',documentsHash:'hash',updatedAt:'2026',certificate:{name:'rup.pdf',issuedOn:'2026',reason:'not_found'}};
  const transfer=async id=>{const form=new FormData();form.set('metadata',JSON.stringify({...snapshot,sourceId:id}));return importDesktopComparison(new Request('http://localhost/import',{method:'POST',body:form}),{DB},{ownerId:'alice'},'req',hash(id));};
  assert.equal((await transfer('first')).status,201);assert.equal((await transfer('second')).status,201);assert.equal((await transfer('first')).status,200);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM imported_rup_comparisons WHERE project_id=?').bind('p').first()).n,2);
 }finally{await worker.dispose();}
});
