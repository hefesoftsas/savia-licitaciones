import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureProjectComponents } from '../project-component-capture.mjs';

test('ignora una referencia de biblioteca dentro de un bloque de código',async()=>{
 const root=await mkdtemp(join(tmpdir(),'savia-library-code-'));
 try {
  const id='00000000-0000-4000-8000-000000000099',ref=`/api/image-library/${id}/file`;
  const payload={complete:false,revision:'a'.repeat(64),project:{id:'p',title:'P'},files:[],assets:[],knowledge:{folders:[],documents:[],indices:[],entries:[]},libraryImages:[{id,etag:null,version:null}],workflow:{requirements:[]},requirementSupports:[],technicalPlan:{nodes:[{content:`\`\`\`\n![Ejemplo](${ref})\n\`\`\``}]},included:['project-header','project-files','project-workflow','technical-plan-nodes','plan-assets','project-knowledge','plan-library-images'],omitted:['other-project-data','other-account-data','credentials']};
  const requests=[],fetchImpl=async url=>{requests.push(url);return Response.json(url.includes('/project-offer-document-captures/')?{revision:'d'.repeat(64),documents:[],links:[],presentation:[]}:url.includes('/project-submission-captures/')?{revision:'c'.repeat(64),requests:[],results:[],submissions:[],attachments:[],evidence:[]}:url.includes('/project-blind-captures/')||url.includes('/project-review-captures/')?{revision:'b'.repeat(64),tasks:[]}:payload);};
  const result=await captureProjectComponents({server:'http://localhost',token:'test',projectId:'p',destination:join(root,'snapshot'),fetchImpl});
  assert.equal(result.objects.length,0);assert.equal(requests.length,10);assert.equal(requests.filter(url=>url.includes('/project-blind-captures/')).length,2);assert.equal(requests.filter(url=>url.includes('/project-review-captures/')).length,2);assert.equal(requests.filter(url=>url.includes('/project-submission-captures/')).length,2);assert.equal(requests.filter(url=>url.includes('/project-offer-document-captures/')).length,2);
  payload.technicalPlan.nodes[0].content=`![Imagen](${ref})`;
  await assert.rejects(captureProjectComponents({server:'http://localhost',token:'test',projectId:'p',destination:join(root,'unavailable'),fetchImpl}),/imagen de biblioteca/i);
  assert.ok(!(await readdir(root)).includes('unavailable'));
 } finally {await rm(root,{recursive:true,force:true});}
});
