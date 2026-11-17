import {test} from 'node:test';
import {createRequire} from 'node:module';
const {PDFDocument}=createRequire(new URL('../../client/package.json',import.meta.url))('pdf-lib');
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('el superadministrador crea un tenant y usuarios que pueden iniciar sesión', {timeout:120000}, async () => {
 const dir=await mkdtemp(join(tmpdir(),'savia-tenants-')); let worker;
 try {
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'tenants'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost',SAVIA_SUPERADMIN_EMAIL:'admin@example.test',SAVIA_SUPERADMIN_PASSWORD:'local-only-password-12345',AUTH_ALLOW_REGISTRATION:'true'}}));
  const db=await worker.getD1Database('DB');
  for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options),post=(path,body,cookie)=>req(path,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  const login=await post('/api/auth/sign-in/email',{email:'admin@example.test',password:'local-only-password-12345'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const bootstrapOwner=await db.prepare(`SELECT m.tenant_id FROM tenant_members m JOIN "user" u ON u.id=m.user_id WHERE u.email=?`).bind('admin@example.test').first();assert.ok(bootstrapOwner);
  assert.equal((await post('/api/admin/tenants',{name:'Sin permiso'})).status,401);
  const selfSignup=await post('/api/auth/sign-up/email',{name:'Cuenta existente',email:'existing@example.test',password:'password-for-testing-existing'});assert.equal(selfSignup.status,200);
  const selfUser=(await selfSignup.clone().json()).user,selfCookie=selfSignup.headers.get('set-cookie').split(';')[0];
  await Promise.all([req('/api/me',{headers:{cookie:selfCookie}}),req('/api/projects',{headers:{cookie:selfCookie}})]);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM tenant_members WHERE user_id=?').bind(selfUser.id).first()).n,1);
  const created=await post('/api/admin/tenants',{name:'Empresa A'},cookie);assert.equal(created.status,201);const tenant=(await created.json()).tenant;assert.equal(tenant.name,'Empresa A');
  await db.prepare(`INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(?,?,?,?,?,?)`).bind('existing-mixed','Existente','Mixed@Example.test',1,1,1).run();
  assert.equal((await post(`/api/admin/tenants/${tenant.id}/users`,{name:'Duplicado',email:'mixed@example.test',password:'password-for-testing-123'},cookie)).status,409);
  const member=await post(`/api/admin/tenants/${tenant.id}/users`,{name:'Ana',email:'ana@example.test',password:'password-for-testing-123'},cookie);assert.equal(member.status,201);
  const userLogin=await post('/api/auth/sign-in/email',{email:'ana@example.test',password:'password-for-testing-123'});assert.equal(userLogin.status,200);const userCookie=userLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/admin/tenants',{name:'Prohibido'},userCookie)).status,403);
  assert.equal((await req('/api/admin/tenants',{headers:{cookie:userCookie}})).status,403);
  const list=await req('/api/admin/tenants',{headers:{cookie}});assert.equal(list.status,200);assert.ok((await list.json()).tenants.some(row=>row.id===tenant.id));
  assert.equal((await post(`/api/admin/tenants/${tenant.id}/users`,{name:'Otra',email:'ana@example.test',password:'password-for-testing-123'},cookie)).status,409);
  assert.equal((await post('/api/admin/tenants/no-existe/users',{name:'Otra',email:'other@example.test',password:'password-for-testing-123'},cookie)).status,404);
  const members=await req(`/api/admin/tenants/${tenant.id}/users`,{headers:{cookie}});assert.equal(members.status,200);assert.equal((await members.json()).users[0].email,'ana@example.test');
  assert.equal((await req(`/api/admin/tenants/${tenant.id}/users`,{headers:{cookie:userCookie}})).status,403);
  const second=await post(`/api/admin/tenants/${tenant.id}/users`,{name:'Luis',email:'luis@example.test',password:'password-for-testing-456'},cookie);assert.equal(second.status,201);
  const luisLogin=await post('/api/auth/sign-in/email',{email:'luis@example.test',password:'password-for-testing-456'});const luisCookie=luisLogin.headers.get('set-cookie').split(';')[0];
  const other=await (await post('/api/admin/tenants',{name:'Empresa B'},cookie)).json();
  const concurrent=await Promise.all([post(`/api/admin/tenants/${other.tenant.id}/users`,{name:'Prueba',email:'race@example.test',password:'password-for-testing-race'},cookie),post(`/api/admin/tenants/${other.tenant.id}/users`,{name:'Prueba',email:'race@example.test',password:'password-for-testing-race'},cookie)]);
  assert.deepEqual(concurrent.map(response=>response.status).sort(),[201,409]);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM "user" WHERE email=?').bind('race@example.test').first()).n,1);
  assert.equal((await post(`/api/admin/tenants/${other.tenant.id}/users`,{name:'Bea',email:'bea@example.test',password:'password-for-testing-789'},cookie)).status,201);
  const beaLogin=await post('/api/auth/sign-in/email',{email:'bea@example.test',password:'password-for-testing-789'});const beaCookie=beaLogin.headers.get('set-cookie').split(';')[0];
  const anaMe=await (await req('/api/me',{headers:{cookie:userCookie}})).json();
  const luisMe=await (await req('/api/me',{headers:{cookie:luisCookie}})).json();
  assert.notEqual(anaMe.user.id,luisMe.user.id);
  assert.equal(anaMe.user.tenant.id,tenant.id);assert.equal(anaMe.user.tenant.name,'Empresa A');
  assert.equal(luisMe.user.tenant.id,tenant.id);
  assert.equal((await (await req('/api/me',{headers:{cookie:beaCookie}})).json()).user.tenant.id,other.tenant.id);
  const preferences=await req('/api/preferences',{method:'PUT',headers:{origin:'http://localhost','content-type':'application/json',cookie:luisCookie},body:JSON.stringify({theme:'dark'})});assert.equal(preferences.status,200);
  assert.equal((await (await req('/api/preferences',{headers:{cookie:userCookie}})).json()).theme,'system');
  assert.equal((await (await req('/api/preferences',{headers:{cookie:luisCookie}})).json()).theme,'dark');
  const profile=(await (await req('/api/company-profile',{headers:{cookie:userCookie}})).json()).profile;profile.companyName='Empresa A de prueba';
  const savedProfile=await req('/api/company-profile',{method:'PUT',headers:{cookie:userCookie,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({profile,version:0})});assert.equal(savedProfile.status,200);
  assert.equal((await (await req('/api/company-profile',{headers:{cookie:luisCookie}})).json()).profile.companyName,'Empresa A de prueba');
  assert.equal((await (await req('/api/company-profile',{headers:{cookie:beaCookie}})).json()).profile.companyName,'');
  const folderResponse=await post('/api/knowledge/folders',{name:'Biblioteca A'},userCookie);assert.equal(folderResponse.status,201);const folder=(await folderResponse.json()).folder;
  assert.ok((await (await req('/api/knowledge/folders',{headers:{cookie:luisCookie}})).json()).folders.some(item=>item.id===folder.id));
  assert.ok(!(await (await req('/api/knowledge/folders',{headers:{cookie:beaCookie}})).json()).folders.some(item=>item.id===folder.id));
  const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();
  const rupUpload=await req('/api/rup/certificate',{method:'PUT',headers:{cookie:userCookie,origin:'http://localhost','content-type':'application/pdf','x-rup-version':'0','x-file-name':'RUP.pdf'},body:bytes});assert.equal(rupUpload.status,200);const certificate=(await rupUpload.json()).certificate;
  assert.equal((await (await req('/api/rup/certificate',{headers:{cookie:luisCookie}})).json()).certificate.id,certificate.id);
  assert.equal((await (await req('/api/rup/certificate',{headers:{cookie:beaCookie}})).json()).certificate,null);
  assert.equal((await req(`/api/rup/certificates/${certificate.id}/pdf`,{headers:{cookie:beaCookie}})).status,404);
  const createdProject=await post('/api/projects',{title:'Proyecto A'},userCookie);assert.equal(createdProject.status,201);const project=(await createdProject.json()).project;
  const selection=await req('/api/project-selection',{method:'PUT',headers:{cookie:luisCookie,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({projectId:project.id})});assert.equal(selection.status,200);
  assert.equal((await (await req('/api/project-selection',{headers:{cookie:luisCookie}})).json()).projectId,project.id);
  assert.equal((await (await req('/api/project-selection',{headers:{cookie:userCookie}})).json()).projectId,null);
  assert.equal((await req('/api/project-selection',{method:'PUT',headers:{cookie:beaCookie,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({projectId:project.id})})).status,404);
  assert.ok((await (await req('/api/projects',{headers:{cookie:luisCookie}})).json()).projects.some(p=>p.id===project.id));
  assert.ok(!(await (await req('/api/projects',{headers:{cookie:beaCookie}})).json()).projects.some(p=>p.id===project.id));
  assert.equal((await req(`/api/projects/${project.id}`,{headers:{cookie:beaCookie}})).status,404);
  const uploaded=await req(`/api/projects/${project.id}/files`,{method:'POST',headers:{cookie:userCookie,origin:'http://localhost','content-type':'text/plain','x-file-name':'prueba.txt'},body:'contenido compartido'});assert.equal(uploaded.status,201);const file=(await uploaded.json()).file;
  const filePath=`/api/projects/${project.id}/files/${file.id}`;
  assert.equal(await (await req(filePath,{headers:{cookie:luisCookie}})).text(),'contenido compartido');
  assert.equal((await req(filePath,{headers:{cookie:beaCookie}})).status,404);
  const pair=await (await post('/api/runner-pairings',{},userCookie)).json();const paired=await post('/api/runners/pair',{name:'Equipo A',code:pair.code});assert.equal(paired.status,201);const runner=(await paired.json()).token;
  assert.equal((await (await req('/api/runners',{headers:{cookie:luisCookie}})).json()).runners.length,1);
  assert.equal((await (await req('/api/runners',{headers:{cookie:beaCookie}})).json()).runners.length,0);
  const task=await req(`/api/projects/${project.id}/jobs`,{method:'POST',headers:{cookie:luisCookie,origin:'http://localhost','content-type':'application/json','idempotency-key':'tenant-job'},body:JSON.stringify({kind:'test.sample',payload:{question:'prueba'}})});assert.equal(task.status,201);const job=(await task.json()).job;
  const otherPair=(await (await post('/api/runner-pairings',{},beaCookie)).json()).code;
  const otherRunner=(await (await post('/api/runners/pair',{name:'Equipo B',code:otherPair})).json()).token;
  const claim=token=>req('/api/runner/jobs/claim',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({kinds:['test.sample']})});
  assert.equal((await (await claim(otherRunner)).json()).job,null);
  const claimed=await (await claim(runner)).json();assert.equal(claimed.job.id,job.id);
  const complete=token=>req(`/api/runner/jobs/${job.id}/complete`,{method:'POST',headers:{origin:'http://localhost','content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({lease:claimed.lease,status:'succeeded',result:{text:'resultado del tenant A'}})});
  assert.notEqual((await complete(otherRunner)).status,200);
  assert.equal((await complete(runner)).status,200);
  const listed=(await (await req(`/api/projects/${project.id}/jobs`,{headers:{cookie:userCookie}})).json()).jobs;
  assert.equal(listed.find(item=>item.id===job.id).state,'succeeded');assert.equal(listed.find(item=>item.id===job.id).result.text,'resultado del tenant A');
  assert.equal((await req(`/api/projects/${project.id}/jobs`,{headers:{cookie:beaCookie}})).status,404);

  assert.equal((await post('/api/auth/admin/ban-user',{userId:anaMe.user.id},cookie)).status,200);
  assert.equal((await req('/api/projects',{headers:{cookie:userCookie}})).status,401);
  assert.ok((await (await req('/api/projects',{headers:{cookie:luisCookie}})).json()).projects.some(item=>item.id===project.id));
  assert.equal((await req('/api/runners/heartbeat',{method:'POST',headers:{authorization:`Bearer ${runner}`}})).status,200);


  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM tenant_members WHERE tenant_id=?').bind(tenant.id).first()).n,2);
  const renamed=await req(`/api/admin/tenants/${tenant.id}`,{method:'PATCH',headers:{origin:'http://localhost','content-type':'application/json',cookie},body:JSON.stringify({name:'Empresa A Renombrada'})});
  assert.equal(renamed.status,200);
  assert.equal((await renamed.json()).tenant.name,'Empresa A Renombrada');
  const assigned=await req(`/api/admin/users/${selfUser.id}/tenant`,{method:'PUT',headers:{origin:'http://localhost','content-type':'application/json',cookie},body:JSON.stringify({tenantId:tenant.id})});
  assert.equal(assigned.status,200);
  assert.equal((await (await req('/api/me',{headers:{cookie:selfCookie}})).json()).user.tenant.id,tenant.id);
  assert.equal((await (await req('/api/me',{headers:{cookie:selfCookie}})).json()).user.tenant.name,'Empresa A Renombrada');
  const adminUsers=await (await req('/api/admin/users',{headers:{cookie}})).json();
  assert.equal(adminUsers.users.find(u=>u.id===selfUser.id).tenantId,tenant.id);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM tenant_members WHERE tenant_id=?').bind(tenant.id).first()).n,3);
 } finally {await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});

test('la administración exige correo verificado cuando está configurado',async()=>{
 const {tenantAdmin}=await import('../src/tenant-admin.js');
 const response=await tenantAdmin(new Request('http://localhost/api/admin/tenants'),{AUTH_REQUIRE_VERIFIED_EMAIL:'true'},{user:{id:'admin',role:'superadmin',emailVerified:false}});
 assert.equal(response.status,403);
 assert.equal((await response.json()).error,'email_not_verified');
});

test('POST y PATCH /api/admin/tenants soportan country y /api/preferences refleja tenant.country', {timeout:120000}, async () => {
 const dir=await mkdtemp(join(tmpdir(),'savia-tenants-country-')); let worker;
 try {
  execFileSync('pnpm',['exec','wrangler','deploy','--dry-run','--outdir',dir],{cwd:root,stdio:'pipe',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false'}});
  worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:await readFile(join(dir,'index.js'),'utf8'),compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'tenants-country'},r2Buckets:['FILES'],bindings:{BETTER_AUTH_SECRET:'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',BETTER_AUTH_URL:'http://localhost',SAVIA_SUPERADMIN_EMAIL:'admin@example.test',SAVIA_SUPERADMIN_PASSWORD:'local-only-password-12345',AUTH_ALLOW_REGISTRATION:'true'}}));
  const db=await worker.getD1Database('DB');
  for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).split(';').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  const req=(path,options={})=>worker.dispatchFetch(`http://localhost${path}`,options);
  const send=(path,method,body,cookie)=>req(path,{method,headers:{origin:'http://localhost','content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  const login=await send('/api/auth/sign-in/email','POST',{email:'admin@example.test',password:'local-only-password-12345'});
  assert.equal(login.status,200);
  const adminCookie=login.headers.get('set-cookie').split(';')[0];

  assert.equal((await send('/api/admin/tenants','POST',{name:'Inválido',country:'FR'},adminCookie)).status,400);

  const esRes=await send('/api/admin/tenants','POST',{name:'Empresa ES',country:'ES'},adminCookie);
  assert.equal(esRes.status,201);
  const esTenant=(await esRes.json()).tenant;
  assert.equal(esTenant.country,'ES');

  const coRes=await send('/api/admin/tenants','POST',{name:'Empresa CO',country:'CO'},adminCookie);
  assert.equal(coRes.status,201);
  assert.equal((await coRes.json()).tenant.country,'CO');

  const allRes=await send('/api/admin/tenants','POST',{name:'Empresa ALL',country:'ALL'},adminCookie);
  assert.equal(allRes.status,201);
  assert.equal((await allRes.json()).tenant.country,'ALL');

  const memberRes=await send(`/api/admin/tenants/${esTenant.id}/users`,'POST',{name:'Carlos',email:'carlos@example.es',password:'password-for-testing-123'},adminCookie);
  assert.equal(memberRes.status,201);
  const carlosLogin=await send('/api/auth/sign-in/email','POST',{email:'carlos@example.es',password:'password-for-testing-123'});
  const carlosCookie=carlosLogin.headers.get('set-cookie').split(';')[0];

  assert.equal((await (await req('/api/preferences',{headers:{cookie:carlosCookie}})).json()).market,'ES');
  const putWhileEs=await send('/api/preferences','PUT',{market:'CO'},carlosCookie);
  assert.equal(putWhileEs.status,200);
  assert.equal((await putWhileEs.json()).market,'ES');

  assert.equal((await send(`/api/admin/tenants/${esTenant.id}`,'PATCH',{country:'XX'},adminCookie)).status,400);

  const patchCo=await send(`/api/admin/tenants/${esTenant.id}`,'PATCH',{country:'CO'},adminCookie);
  assert.equal(patchCo.status,200);
  assert.equal((await patchCo.json()).tenant.country,'CO');
  assert.equal((await (await req('/api/preferences',{headers:{cookie:carlosCookie}})).json()).market,'CO');

  const patchAll=await send(`/api/admin/tenants/${esTenant.id}`,'PATCH',{country:'ALL'},adminCookie);
  assert.equal(patchAll.status,200);
  assert.equal((await patchAll.json()).tenant.country,'ALL');
  assert.equal((await (await req('/api/preferences',{headers:{cookie:carlosCookie}})).json()).market,'CO');
  const putEs=await send('/api/preferences','PUT',{market:'ES'},carlosCookie);
  assert.equal(putEs.status,200);
  assert.equal((await putEs.json()).market,'ES');
 } finally {await worker?.dispose();await rm(dir,{recursive:true,force:true});}
});
