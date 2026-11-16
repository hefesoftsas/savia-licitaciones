import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdtemp,readdir,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {exportTechnicalPlan} from '../technical-plan-export.mjs';
const require=createRequire(new URL('../../client/package.json',import.meta.url)),AdmZip=require('adm-zip');
test('Linux genera Word con el helper real, texto Unicode e imagen PNG',{skip:process.env.SAVIA_TEST_LINUX_WORD!=='1',timeout:120000},async()=>{
 const tempRoot=await mkdtemp(join(tmpdir(),'savia-linux-word-'));try{
  const reference='savia-asset://imported-images/plan-a/plano.png',png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR6cAAAAASUVORK5CYII=','base64');
  const result=await exportTechnicalPlan({projectTitle:'Licitación de Bogotá',planAssets:[{kind:'url',reference,contentType:'image/png',bytes:png}],outline:[{id:'one',number:'1',title:'Solución técnica',content_mode:'manual-fill',content:`Contenido **verificado**.\n\n![Plano](${reference})`,children:[]}]},{language:'es',tempRoot});
  const zip=new AdmZip(result.bytes),document=zip.readAsText('word/document.xml');assert.match(document,/Licitación de Bogotá/);assert.match(document,/Solución técnica/);assert.match(document,/verificado/);assert.ok(zip.getEntries().some(entry=>/^(?:word\/)?media\//.test(entry.entryName)&&entry.getData().equals(png)));assert.deepEqual(await readdir(tempRoot),[]);
 }finally{await rm(tempRoot,{recursive:true,force:true});}
});
