import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createComponentSnapshot } from '../cloud-snapshot-archive.mjs';

test('rechaza capturas con archivos mayores de 1 GiB antes de crear el proyecto', async () => {
  const root = await mkdtemp(join(tmpdir(),'savia-restore-limit-'));
  try {
    const directory = join(root,'snapshot'), size = 1024*1024*1024+1;
    await assert.rejects(createComponentSnapshot(directory,{
      metadata:{project:{id:'p',title:'Proyecto'},files:[{id:'f',name:'archivo.pdf',content_type:'application/pdf',size}]},
      included:['project-header','project-files'],omitted:['other-project-data','other-account-data','credentials'],
      objects:[{id:'f',size,open:()=>Readable.from([])}],
    }),/manifiesto/i);
  } finally { await rm(root,{recursive:true,force:true}); }
});
