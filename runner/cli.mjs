#!/usr/bin/env node
const protocolWrite=process.stdout.write.bind(process.stdout);
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { runOnce, recoverPending, recoverArtifactPending, recoverTechnicalDrafts } from './work-loop.mjs';
import { createOutbox, hasOutboxFiles } from './outbox.mjs';
import { createArtifactOutbox, hasArtifactOutboxFiles } from './artifact-outbox.mjs';
import { cleanupOrphanedWorkspaces } from './managed-workspaces.mjs';
import economicOffer from '../client/electron/services/economicOfferService.cjs';
import { transferDesktopBidEvaluation } from './desktop-bid-evaluation.mjs';
import { transferDesktopPlanDocument } from './desktop-plan-documents.mjs';
import { transferDesktopSubmission } from './desktop-submission-transfer.mjs';
import { transferDesktopAddendum } from './desktop-addendum-transfer.mjs';
import { transferDesktopOfferDocuments } from './desktop-offer-transfer.mjs';
import { createOpportunityRunnerScheduler } from './opportunity-runner-scheduler.mjs';
import {createPreviewWake,connectPreviewWake} from './preview-wake.mjs';
import {createAccessFetch} from './cloudflare-access.mjs';
import {runWorkerPool} from './worker-pool.mjs';
import {runIsolatedWorker} from './isolated-worker.mjs';
import {isMainThread,parentPort,workerData} from 'node:worker_threads';

const args = process.argv.slice(2);
const command = args.shift();
function option(name, fallback) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
const configPath = resolve(option('--config', join(homedir(), '.savia', 'runner.json')));

async function transferOpportunityTracking(server, token, requestId, tracking) {
  if (!tracking) return 'absent';
  const response = await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/opportunity-tracking`, {method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(tracking),redirect:'error',signal:AbortSignal.timeout(60_000)});
  if (response.status === 409) return 'conflict';
  if (response.status === 410) return 'removed';
  if (!response.ok) throw new Error(`No se pudo importar el seguimiento de oportunidad (HTTP ${response.status}). Repite el comando para continuar.`);
  return 'imported';
}

async function transferRequirementSupports(server, token, requestId, supports, archiveHash) {
  if (!supports.length) return 'absent';
  const items=supports.map(({id,requirementId,title,status,certificateId,createdAt})=>({id,requirementId,title,status,linkType:!certificateId?'none':certificateId.startsWith('rup:')?'rup':'certificate',linkId:certificateId,createdAt}));
  const response=await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/requirement-supports`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({items,archiveHash}),redirect:'error',signal:AbortSignal.timeout(60_000)});
  if(response.status===409)return 'conflict';
  if(response.status===410)return 'removed';
  if(!response.ok)throw new Error(`No se pudieron importar los soportes de requisitos (HTTP ${response.status}). Repite el comando para continuar.`);
  return 'imported';
}

function serverUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('La dirección del servidor no es válida.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('El servidor debe usar HTTPS, salvo en pruebas locales.');
  }
  return url.origin;
}

async function saveConfig(config) {
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  const temporary = `${configPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(config), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    if (process.platform !== 'win32') await chmod(temporary, 0o600);
    await rename(temporary, configPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function post(url, body, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`El servidor rechazó la solicitud (${response.status}).`);
  return response.json();
}

async function main() {
  let accessConfig;
  try { accessConfig = JSON.parse(await readFile(configPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const envAccess = process.env.SAVIA_CF_ACCESS_CLIENT_ID || process.env.SAVIA_CF_ACCESS_CLIENT_SECRET
    ? {clientId:process.env.SAVIA_CF_ACCESS_CLIENT_ID,clientSecret:process.env.SAVIA_CF_ACCESS_CLIENT_SECRET} : null;
  delete process.env.SAVIA_CF_ACCESS_CLIENT_ID;
  delete process.env.SAVIA_CF_ACCESS_CLIENT_SECRET;
  const access = envAccess || accessConfig?.cloudflareAccess || (!isMainThread&&workerData?.saviaPoolSlot?workerData.cloudflareAccess:undefined);
  const accessServer = command === 'pair' ? option('--server', '') : accessConfig?.server;
  if (access && accessServer) globalThis.fetch = createAccessFetch(serverUrl(accessServer), access);
  if (command === 'restore-account-projects') {
    const directory=option('--snapshot',''),knowledgeDirectory=option('--knowledge-snapshot','');
    if(!isAbsolute(directory)||(knowledgeDirectory&&!isAbsolute(knowledgeDirectory)))throw new Error('Indica rutas absolutas para las capturas.');
    const config=JSON.parse(await readFile(configPath,'utf8')),{restoreAccountProjects}=await import('./account-projects-restore.mjs');
    const result=await restoreAccountProjects({server:serverUrl(config.server),token:config.token,directory,...(knowledgeDirectory?{knowledgeDirectory}:{}),onProgress:(id,value)=>process.stdout.write(`Proyecto ${id}: ${JSON.stringify(value)}\n`)});
    process.stdout.write(`Recuperación parcial de ${result.projects.length} proyectos. Componentes omitidos: ${result.omitted.join(', ')}. No es una recuperación completa.\n`);return;
  }
  if (command === 'capture-account-projects') {
    const destination=option('--output','');if(!isAbsolute(destination))throw new Error('Indica una ruta absoluta nueva con --output.');
    const config=JSON.parse(await readFile(configPath,'utf8')),{captureAccountProjects}=await import('./account-projects-capture.mjs');
    const result=await captureAccountProjects({server:serverUrl(config.server),token:config.token,destination,onProgress:id=>process.stdout.write(`Proyecto capturado: ${id}.\n`)});
    process.stdout.write(`Captura parcial de ${result.projects.length} proyectos. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);return;
  }
  if (command === 'restore-account-components') {
    const directory=option('--snapshot',''),input=option('--expected-revision','');
    if(!isAbsolute(directory))throw new Error('Indica una ruta absoluta para la captura.');
    if(!/^(0|[1-9][0-9]*)$/.test(input)||!Number.isSafeInteger(Number(input))||Number(input)>=Number.MAX_SAFE_INTEGER)throw new Error('Indica la revisión actual del destino con --expected-revision.');
    const config=JSON.parse(await readFile(configPath,'utf8'));
    const {restoreAccountComponents}=await import('./account-components-restore.mjs');
    const result=await restoreAccountComponents({server:serverUrl(config.server),token:config.token,directory,expectedRevision:Number(input),onProgress:(name,value)=>process.stdout.write(`${name}: ${JSON.stringify(value)}\n`)});
    process.stdout.write(`Recuperación parcial. Componentes omitidos: ${result.omitted.join(', ')}. No es una recuperación completa.\n`);
    return;
  }
  if (command === 'capture-account-components') {
    const destination=option('--output','');
    if(!isAbsolute(destination))throw new Error('Indica una ruta absoluta nueva con --output.');
    const config=JSON.parse(await readFile(configPath,'utf8'));
    const {captureAccountComponents}=await import('./account-components-capture.mjs');
    const result=await captureAccountComponents({server:serverUrl(config.server),token:config.token,destination,onProgress:name=>process.stdout.write(`Capturado: ${name}.\n`)});
    process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);
    return;
  }
  if (command === 'service-install' || command === 'service-remove') {
    const {installUserService,removeUserService} = await import('./user-service.mjs');
    const options = {cli:fileURLToPath(import.meta.url),config:configPath};
    if (command === 'service-install') {
      const release = await (await import('./runner-lock.mjs')).acquireRunnerLock(configPath);
      await release();
      await installUserService(options);
      process.stdout.write('Runner iniciado para esta sesión y configurado para iniciar al entrar. Usa service-remove para detenerlo y retirarlo.\n');
    } else {
      await removeUserService(options);
      process.stdout.write('Inicio automático del runner retirado.\n');
    }
    return;
  }
  if (command === 'doctor') {
    const {inspectRunner} = await import('./doctor.mjs');
    const report = await inspectRunner({root:resolve(dirname(fileURLToPath(import.meta.url)), '..'),configPath});
    for (const check of report.checks) process.stdout.write(`${check.status === 'ok' ? 'OK' : check.status === 'warning' ? 'AVISO' : 'ERROR'}: ${check.message}\n`);
    process.stdout.write('Diagnóstico local: no verifica conexión, credenciales con el proveedor ni ejecución completa.\n');
    if (report.checks.some(check => check.status === 'error')) process.exitCode = 1;
    return;
  }
  if (['read-account-preferences', 'capture-account-preferences', 'restore-account-preferences'].includes(command)) {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const options = {server:serverUrl(config.server),token:config.token};
    const {readAccountPreferences,captureAccountPreferences,restoreAccountPreferences} = await import('./account-preferences-snapshot.mjs');
    if (command === 'read-account-preferences') {
      const current = await readAccountPreferences(options);
      process.stdout.write(`Revisión de preferencias: ${current.revision}.\n`);
      return;
    }
    const directory = option(command === 'capture-account-preferences' ? '--output' : '--snapshot', '');
    if (!isAbsolute(directory)) throw new Error('Indica una ruta absoluta para la captura.');
    if (command === 'capture-account-preferences') {
      const result = await captureAccountPreferences({...options,directory});
      process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);
      return;
    }
    const input = option('--expected-revision', '');
    if (!/^(0|[1-9][0-9]*)$/.test(input)) throw new Error('Indica la revisión del destino con --expected-revision.');
    const result = await restoreAccountPreferences({...options,directory,expectedRevision:Number(input)});
    process.stdout.write(`Preferencias recuperadas. Nueva revisión: ${result.revision}.\n`);
    return;
  }
  if (['capture-account-experience','restore-account-experience'].includes(command)) {
    const directory=option(command==='capture-account-experience'?'--output':'--snapshot','');if(!isAbsolute(directory))throw new Error('Indica una ruta absoluta para la captura.');const config=JSON.parse(await readFile(configPath,'utf8')),{captureAccountExperience,restoreAccountExperience}=await import('./account-experience-snapshot.mjs'),options={server:serverUrl(config.server),token:config.token,directory};if(command==='capture-account-experience'){const result=await captureAccountExperience(options);process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);}else{const result=await restoreAccountExperience(options);process.stdout.write(`Experiencia recuperada: ${result.projects} proyectos, ${result.images} imágenes; retirados: ${result.removedProjects} proyectos y ${result.removedImages} imágenes.\n`);}return;
  }
  if (['capture-account-paa','restore-account-paa'].includes(command)) {
    const directory=option(command==='capture-account-paa'?'--output':'--snapshot','');if(!isAbsolute(directory))throw new Error('Indica una ruta absoluta para la captura.');const config=JSON.parse(await readFile(configPath,'utf8')),{captureAccountPaa,restoreAccountPaa}=await import('./account-paa-snapshot.mjs'),options={server:serverUrl(config.server),token:config.token,directory};if(command==='capture-account-paa'){const result=await captureAccountPaa(options);process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);}else{const result=await restoreAccountPaa(options);process.stdout.write(`Seguimientos recuperados: ${result.watches}; retirados: ${result.removed}.\n`);}return;
  }
  if (['capture-account-knowledge','restore-account-knowledge'].includes(command)) {
    const directory=option(command==='capture-account-knowledge'?'--output':'--snapshot','');if(!isAbsolute(directory))throw new Error('Indica una ruta absoluta para la captura.');const config=JSON.parse(await readFile(configPath,'utf8')),options={server:serverUrl(config.server),token:config.token,directory};if(command==='capture-account-knowledge'){const {captureAccountKnowledge}=await import('./account-knowledge-capture.mjs'),result=await captureAccountKnowledge(options);process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);}else{const {restoreAccountKnowledge}=await import('./account-knowledge-restore.mjs'),result=await restoreAccountKnowledge(options);process.stdout.write(`Carpetas recuperadas: ${result.folders}; documentos recuperados: ${result.documents}; carpetas retiradas: ${result.removedFolders}; documentos retirados: ${result.removedDocuments}.\n`);}return;
  }
  if (['capture-account-export-format','restore-account-export-format'].includes(command)) {
    const directory=option(command==='capture-account-export-format'?'--output':'--snapshot','');if(!isAbsolute(directory))throw new Error('Indica una ruta absoluta para la captura.');
    const config=JSON.parse(await readFile(configPath,'utf8')),{captureAccountExportFormat,restoreAccountExportFormat}=await import('./account-export-format-snapshot.mjs'),options={server:serverUrl(config.server),token:config.token,directory};
    if(command==='capture-account-export-format'){const result=await captureAccountExportFormat(options);process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);}else{const result=await restoreAccountExportFormat(options);process.stdout.write(`Formato recuperado: ${result.format?'sí':'no'}; plantillas recuperadas: ${result.templates}; plantillas retiradas: ${result.removed}.\n`);}return;
  }
  if (['capture-account-feasibility','restore-account-feasibility','discard-account-feasibility-restore'].includes(command)) {
    const directory=option(command==='capture-account-feasibility'?'--output':'--snapshot','');if(!isAbsolute(directory))throw new Error('Indica una ruta absoluta para la captura.');
    const config=JSON.parse(await readFile(configPath,'utf8')),{captureAccountFeasibility}=await import('./account-feasibility-capture.mjs');
    if(command==='capture-account-feasibility'){const result=await captureAccountFeasibility({server:serverUrl(config.server),token:config.token,directory});process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);}else{const {restoreAccountFeasibility}=await import('./account-feasibility-restore.mjs');const result=await restoreAccountFeasibility({server:serverUrl(config.server),token:config.token,directory,discard:command==='discard-account-feasibility-restore'});process.stdout.write(command==='discard-account-feasibility-restore'?'Preparación descartada.\n':`Viabilidad recuperada. Componentes omitidos: ${result.omitted.join(', ')}.\n`);}return;
  }
  if (['capture-account-certificates', 'restore-account-certificates'].includes(command)) {
    const directory=option(command==='capture-account-certificates'?'--output':'--snapshot','');
    if(!isAbsolute(directory))throw new Error('Indica una ruta absoluta para la captura.');
    const config=JSON.parse(await readFile(configPath,'utf8')),{captureAccountCertificates,restoreAccountCertificates}=await import('./account-certificates-snapshot.mjs');
    const options={server:serverUrl(config.server),token:config.token,directory};
    if(command==='capture-account-certificates'){const result=await captureAccountCertificates(options);process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);}
    else{const result=await restoreAccountCertificates(options);process.stdout.write(`Certificados recuperados: ${result.certificates}; imágenes: ${result.images}; certificados eliminados: ${result.removedCertificates}; imágenes eliminadas: ${result.removedImages}.\n`);}
    return;
  }
  if (['capture-account-rup', 'restore-account-rup'].includes(command)) {
    const directory=option(command==='capture-account-rup'?'--output':'--snapshot','');
    if(!isAbsolute(directory))throw new Error('Indica una ruta absoluta para la captura.');
    const config=JSON.parse(await readFile(configPath,'utf8')),{captureAccountRup,restoreAccountRup}=await import('./account-rup-snapshot.mjs');
    const options={server:serverUrl(config.server),token:config.token,directory};
    if(command==='capture-account-rup'){const result=await captureAccountRup(options);process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);}
    else{const result=await restoreAccountRup(options);process.stdout.write(result.imported?`RUP recuperado: ${result.factCount} hechos revisados; vigente: ${result.current?'sí':'no'}.\n`:'La captura no contiene un RUP vigente; no se modificó la cuenta.\n');}
    return;
  }
  if (['capture-account-image-library', 'restore-account-image-library'].includes(command)) {
    const directory=option(command==='capture-account-image-library'?'--output':'--snapshot','');
    if(!isAbsolute(directory))throw new Error('Indica una ruta absoluta para la captura.');
    const config=JSON.parse(await readFile(configPath,'utf8')),{captureAccountImageLibrary,restoreAccountImageLibrary}=await import('./account-image-library-snapshot.mjs');
    const options={server:serverUrl(config.server),token:config.token,directory};
    if(command==='capture-account-image-library'){const result=await captureAccountImageLibrary(options);process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);}
    else{const result=await restoreAccountImageLibrary(options);process.stdout.write(`Biblioteca recuperada: ${result.images} imágenes; ${result.removed} eliminadas anteriormente. Componentes omitidos: ${result.omitted.join(', ')}.\n`);}
    return;
  }
  if (['capture-account-company-profile', 'restore-account-company-profile'].includes(command)) {
    const directory = option(command === 'capture-account-company-profile' ? '--output' : '--snapshot', '');
    if (!isAbsolute(directory)) throw new Error('Indica una ruta absoluta para la captura.');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const options = {server:serverUrl(config.server),token:config.token,directory};
    const {captureAccountCompanyProfile,restoreAccountCompanyProfile} = await import('./account-company-profile-snapshot.mjs');
    if (command === 'capture-account-company-profile') {
      const result = await captureAccountCompanyProfile(options);
      process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);
    } else {
      const result = await restoreAccountCompanyProfile(options);
      process.stdout.write(`Perfil recuperado: ${result.images} imágenes; ${result.removed} eliminadas anteriormente. Componentes omitidos: ${result.omitted.join(', ')}.\n`);
    }
    return;
  }
  if (command === 'restore-project-components') {
    const directory = option('--snapshot', '');
    if (!isAbsolute(directory)) throw new Error('Indica la ruta absoluta de la captura con --snapshot.');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const { restoreProjectComponents } = await import('./project-component-restore.mjs');
    const knowledgeDirectory=option('--knowledge-snapshot','');if(knowledgeDirectory&&!isAbsolute(knowledgeDirectory))throw new Error('Indica una ruta absoluta para la biblioteca.');
    const result = await restoreProjectComponents({server:serverUrl(config.server),token:config.token,directory,...(knowledgeDirectory?{knowledgeDirectory}:{})});
    process.stdout.write(`Recuperación parcial en el proyecto ${result.projectId}: ${result.files} archivos. Componentes omitidos: ${result.omitted.join(', ')}.\n`);
    return;
  }
  if (command === 'capture-project-components') {
    const destination = option('--output', '');
    if (!isAbsolute(destination)) throw new Error('Indica una ruta absoluta nueva con --output.');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const { captureProjectComponents } = await import('./project-component-capture.mjs');
    const result = await captureProjectComponents({server:serverUrl(config.server),token:config.token,projectId:option('--project',''),destination});
    process.stdout.write(`Captura parcial creada. Componentes omitidos: ${result.omitted.join(', ')}. No es un respaldo completo.\n`);
    return;
  }
  if (command === 'import-export-format') {
    const {readDesktopExportFormat}=await import('./desktop-capture.mjs');
    const format=await readDesktopExportFormat(option('--user-data',''));
    const config=JSON.parse(await readFile(configPath,'utf8')),server=serverUrl(config.server),requestId=`desktop-export-format-${createHash('sha256').update(JSON.stringify(format)).digest('hex')}`;
    const result=await post(`${server}/api/runner/imports/export-format/${requestId}`,{format},config.token);
    process.stdout.write(JSON.stringify({imported:result.imported})+'\n');return;
  }
  if (command === 'cleanup-imports') {
    const config = JSON.parse(await readFile(configPath, 'utf8')), server = serverUrl(config.server);
    const response = await fetch(`${server}/api/runner/imports/cleanup`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` }, body: '{}', redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`No se pudo limpiar importaciones (${response.status}).`);
    const result = await response.json(); process.stdout.write(JSON.stringify(result) + '\n'); if (result.failed) process.exitCode = 1;
    return;
  }
  if (command === 'list-desktop-companies' || command === 'create-backup') {
    const { listDesktopCompanies, createDesktopBackup } = await import('./desktop-capture.mjs');
    const userData = option('--user-data', '');
    const result = command === 'list-desktop-companies' ? await listDesktopCompanies(userData) : await createDesktopBackup({ userData, companyId: option('--company', ''), output: option('--output', '') });
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }
  if (command === 'inspect-backup' || command === 'import-export-templates' || command === 'import-feasibility' || command === 'import-plan' || command === 'import-rup' || command === 'import-knowledge' || command === 'import-certificates' || command === 'import-company-profile' || command === 'import-company-experience' || command === 'import-paa' || command === 'import-saved-tenders' || command === 'import-images' || command === 'import-duplicate-check' || command === 'import-rejection-check') {
    const backupPath = option('--backup', '');
    if (!isAbsolute(backupPath)) throw new Error('Indica la ruta absoluta del respaldo con --backup.');
    const archive = await readFile(backupPath);
    const { inspectDesktopBackup } = await import('./desktop-backup.mjs');
    const inspection = await inspectDesktopBackup(archive);
    if (command === 'inspect-backup') {
      const countChapters=nodes=>nodes.reduce((count,node)=>count+1+countChapters(node.children||[]),0);
      const feasibility=inspection.feasibility?{present:true,sourceCount:inspection.feasibility.sources.length,missingSourceCount:inspection.feasibility.sources.filter(item=>item.missing).length,chapterCount:countChapters(inspection.feasibility.state.outlineData?.outline||[]),taskCount:inspection.feasibility.tasks.length,assetCount:inspection.feasibility.assets.length,missingAssetCount:inspection.feasibility.missingAssets.length}:null;
      process.stdout.write(JSON.stringify({ companyName: inspection.companyName, schemaVersion: inspection.schemaVersion, exportTemplates: { count: inspection.exportTemplates.items.length, invalidCount: inspection.exportTemplates.invalidCount }, companyExperience: { count: inspection.companyExperience.length, imageCount: inspection.companyExperience.reduce((sum,item)=>sum+item.imageCount,0) }, companyProfile: { present: !!inspection.companyProfile, imageCount: inspection.companyProfileImages.length, missingImageCount: inspection.companyProfileImages.filter(image => image.missing).length }, feasibility, projects: inspection.projects.map(({ sourceId, title, active, nodes, facts, analyses, chatMessages, documents, missingDocuments, assets, missingAssets, workflow, economicOffer, comparisons, secop, secopIssue, bidEvaluation, submission, offerDocuments, addendum }) => ({ addendumRunCount:addendum.runs.length, interruptedAddendumRunCount:addendum.runs.filter(item=>item.status==='interrupted').length, sourceId, title, active, nodeCount: nodes.length, factGroupCount: facts.length, analysisCount: analyses.length, chatMessageCount: chatMessages.length, evaluationCount: bidEvaluation.runs.length, evaluationDocumentCount: bidEvaluation.documents.length, missingEvaluationOriginals: bidEvaluation.documents.filter(item=>item.missing).length, documentCount: documents.length, missingDocuments, assetCount: assets.length, missingAssetCount: missingAssets.length, offerDocumentCount: offerDocuments.documents.length, missingOfferDocumentCount: offerDocuments.documents.filter(item=>item.missing).length, changedOfferDocumentCount: offerDocuments.presentation.filter(item=>item.state==='changed').length, offerDocumentReviewCount: offerDocuments.presentation.filter(item=>item.reviewRequired).length, offerSupportLinkCount: offerDocuments.links.length, orphanOfferLinkCount: offerDocuments.orphanLinks.length, submissionRequestCount: submission.requests.length, submissionResultCount: submission.results.length, submissionRecordCount: submission.submissions.length, missingSubmissionFiles: submission.missing.length, taskCount: workflow?.tasks.length || 0, requirementCount: workflow?.requirements.length || 0, hasWorkflowStage: !!workflow?.stage, hasEconomicOffer: !!economicOffer, comparisonCount: comparisons.length, secopLinked: !!secop, secopIssue, secopAlertCount: secop?.alerts.length || 0, missingComparisonSources: comparisons.filter(item => item.certificate.missing).length })), rup: inspection.rup ? { present: true, missing: !!inspection.rup.missing, reason: inspection.rup.reason || null, factCount: inspection.rup.facts.length } : null, knowledge: { folderCount: inspection.knowledge.folders.length, documentCount: inspection.knowledge.folders.reduce((count, folder) => count + folder.documents.length, 0), missingCount: inspection.knowledge.folders.reduce((count, folder) => count + folder.documents.filter(document => document.missing).length, 0) }, companyCertificates: { count: inspection.companyCertificates.length, imageCount: inspection.companyCertificates.reduce((sum, item) => sum + item.imageCount, 0) }, imageLibrary: { count: inspection.imageLibrary.length, missingCount: inspection.imageLibrary.filter(item=>item.missing).length }, duplicateCheck: { present: inspection.duplicateCheck.present, fileCount: inspection.duplicateCheck.files.length, missingOriginalCount: inspection.duplicateCheck.files.filter(item=>item.original.missing).length, missingContentCount: inspection.duplicateCheck.files.filter(item=>item.content.missing).length }, rejectionCheck: { present: inspection.rejectionCheck.present, documentCount: inspection.rejectionCheck.documents.length, missingDocumentCount: inspection.rejectionCheck.documents.filter(item=>item.missing).length, imageCount: inspection.rejectionCheck.assets.length, missingImageCount: inspection.rejectionCheck.missingAssets.length }, savedTenders: { count: inspection.savedTenders.length, linked: inspection.savedTenders.filter(item=>item.association==='linked').length, ambiguous: inspection.savedTenders.filter(item=>item.association==='ambiguous').length, standaloneOfferDocumentCount: inspection.savedTenders.filter(item=>item.association==='standalone').reduce((count,item)=>count+(item.offerDocuments?.documents.length||0),0), standaloneMissingOfferDocumentCount: inspection.savedTenders.filter(item=>item.association==='standalone').reduce((count,item)=>count+(item.offerDocuments?.documents.filter(file=>file.missing).length||0),0) }, paaWatches: { count: inspection.paaWatches.items.length, alertCount: inspection.paaWatches.items.reduce((sum,item)=>sum+item.alerts.length,0), orphanAlertCount: inspection.paaWatches.orphanAlertCount }, unavailable: inspection.unavailable, omitted: inspection.omitted }) + '\n');
      return;
    }
    if (command === 'import-export-templates') {
      const config=JSON.parse(await readFile(configPath,'utf8')),server=serverUrl(config.server),requestId=`desktop-export-templates-${createHash('sha256').update(archive).digest('hex')}`;let imported=0,removed=0;
      for(const item of inspection.exportTemplates.items){const sourceKey=createHash('sha256').update(item.sourceId).digest('hex'),response=await fetch(`${server}/api/runner/imports/export-templates/${requestId}/${sourceKey}`,{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify(item),redirect:'error',signal:AbortSignal.timeout(60000)});if(response.status===410){removed++;continue;}if(!response.ok)throw new Error(`No se pudo importar la plantilla (HTTP ${response.status}). Repite el comando para continuar.`);imported++;}
      process.stdout.write(JSON.stringify({imported,removed,invalid:inspection.exportTemplates.invalidCount})+'\n');return;
    }
    if (command === 'import-company-experience') {
      const config=JSON.parse(await readFile(configPath,'utf8')),server=serverUrl(config.server),requestId=`desktop-company-experience-${createHash('sha256').update(archive).digest('hex')}`;
      let imported=0,removed=0,importedImages=0,removedImages=0;const missingImages=[];
      for(const {imageCount:_imageCount,images,...project} of inspection.companyExperience){
        const sourceKey=createHash('sha256').update(project.sourceId).digest('hex');
        const response=await fetch(`${server}/api/runner/imports/company-experience/${requestId}/${sourceKey}`,{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify(project),redirect:'error',signal:AbortSignal.timeout(60_000)});
        if(response.status===410){removed++;continue;}if(!response.ok)throw new Error(`No se pudo importar la experiencia (HTTP ${response.status}). Repite el comando para continuar.`);
        imported++;
        for(const image of images){
          if(typeof image.sourceId!=='string'||!image.sourceId)throw new Error('El respaldo contiene un soporte sin identificador.');
          const imageKey=createHash('sha256').update(image.sourceId).digest('hex');
          if(image.missing){missingImages.push({sourceKey:imageKey,reason:image.reason});continue;}
          const {bytes,...metadata}=image,form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set('file',new Blob([bytes]),'image');
          const upload=await fetch(`${server}/api/runner/imports/company-experience/${requestId}/images/${imageKey}`,{method:'POST',headers:{authorization:`Bearer ${config.token}`},body:form,redirect:'error',signal:AbortSignal.timeout(60_000)});
          if(upload.status===410){removedImages++;continue;}if(upload.status===415||upload.status===422){missingImages.push({sourceKey:imageKey,reason:upload.status===415?'unsupported':'unsupported_category'});continue;}
          if(!upload.ok)throw new Error(`Se importó la experiencia, pero falló un soporte (HTTP ${upload.status}). Repite el comando para continuar.`);importedImages++;
        }
      }
      process.stdout.write(JSON.stringify({imported,removed,importedImages,removedImages,missingImages})+'\n');return;
    }
    if (command === 'import-company-profile') {
      if (!inspection.companyProfile) throw new Error('El respaldo no contiene un perfil de empresa.');
      const config=JSON.parse(await readFile(configPath,'utf8')),server=serverUrl(config.server),requestId=`desktop-company-profile-${createHash('sha256').update(archive).digest('hex')}`;
      const response=await fetch(`${server}/api/runner/imports/company-profile/${requestId}`,{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify({profile:inspection.companyProfile}),redirect:'error',signal:AbortSignal.timeout(60_000)});
      if(!response.ok)throw new Error(`No se pudo importar el perfil (HTTP ${response.status}). Si ya existe un perfil web, no se reemplaza.`);
      const result=await response.json();let importedImages=0,removedImages=0;const missingImages=[];
      for(const image of inspection.companyProfileImages){
        if(typeof image.sourceId!=='string'||!image.sourceId)throw new Error('El respaldo contiene una imagen de perfil sin identificador.');
        const sourceKey=createHash('sha256').update(image.sourceId).digest('hex');
        if(image.missing){missingImages.push({sourceKey,reason:image.reason});continue;}
        const {bytes,...metadata}=image,form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set('file',new Blob([bytes]),'image');
        const upload=await fetch(`${server}/api/runner/imports/company-profile/${requestId}/images/${sourceKey}`,{method:'POST',headers:{authorization:`Bearer ${config.token}`},body:form,redirect:'error',signal:AbortSignal.timeout(60_000)});
        if(upload.status===410){removedImages++;continue;}if(upload.status===415||upload.status===422){missingImages.push({sourceKey,reason:upload.status===415?'unsupported':'unsupported_category'});continue;}
        if(!upload.ok)throw new Error(`Se importó el perfil, pero falló una imagen (HTTP ${upload.status}). Repite el comando para continuar.`);importedImages++;
      }
      process.stdout.write(JSON.stringify({imported:result.imported,importedImages,removedImages,missingImages})+'\n');return;
    }
    if (command === 'import-feasibility') {
      const report=inspection.feasibility;if(!report)throw new Error('El respaldo no contiene un informe de viabilidad.');
      const config=JSON.parse(await readFile(configPath,'utf8')),server=serverUrl(config.server),auth={authorization:`Bearer ${config.token}`},hash=value=>createHash('sha256').update(value).digest('hex'),requestId=`desktop-feasibility-${hash(archive)}`;
      const sources=report.sources.map(source=>({...source,sourceKey:hash(source.id)}));
      if(sources.some(source=>!source.id)||new Set(sources.map(source=>source.sourceKey)).size!==sources.length)throw new Error('El informe contiene identificadores de fuente inválidos o duplicados.');
      const sourceFiles=report.state.sourceFiles.map((file,index)=>{const {markdownPath,...metadata}=file,source=sources[index];return {...metadata,sourceKey:source.sourceKey,expected:!source.missing,...(source.missing?{reason:source.reason}:{})};});
      const snapshot={report:{...report.state,sourceFiles},tasks:report.tasks};
      const base=`${server}/api/runner/imports/feasibility/${requestId}`,response=await fetch(base,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify(snapshot),redirect:'error',signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw new Error(`No se pudo importar el informe de viabilidad (HTTP ${response.status}). Si ya existe un informe web, no se reemplaza.`);
      let uploadedSources=0,removedSources=0;const missingSources=[];
      for(const source of sources){if(source.missing){missingSources.push({sourceKey:source.sourceKey,reason:source.reason});continue;}const upload=await fetch(`${base}/sources/${source.sourceKey}`,{method:'POST',headers:{...auth,'content-type':'text/plain; charset=utf-8'},body:source.bytes,redirect:'error',signal:AbortSignal.timeout(60000)});if(upload.status===410){removedSources++;continue;}if(!upload.ok)throw new Error(`Se importó el informe, pero no se pudo transferir una fuente (HTTP ${upload.status}). Repite el comando.`);uploadedSources++;}
      let uploadedAssets=0;const missingAssets=report.missingAssets.map(item=>({sourceKey:hash(JSON.stringify([item.kind,item.reference])),reason:item.reason}));
      for(const asset of report.assets){const sourceKey=hash(JSON.stringify([asset.kind,asset.reference])),upload=await fetch(`${base}/assets/${sourceKey}`,{method:'POST',headers:{...auth,'x-asset-kind':asset.kind,'x-asset-reference':encodeURIComponent(asset.reference),'content-type':'application/octet-stream'},body:asset.bytes,redirect:'error',signal:AbortSignal.timeout(60000)});if(!upload.ok)throw new Error(`Se importó el informe, pero no se pudo transferir una imagen (HTTP ${upload.status}). Repite el comando.`);uploadedAssets++;}
      process.stdout.write(JSON.stringify({imported:true,uploadedSources,removedSources,missingSources,uploadedAssets,missingAssets,taskCount:report.tasks.length})+'\n');return;
    }
    if (command === 'import-rejection-check') {
      const review=inspection.rejectionCheck;if(!review.present)throw new Error('El respaldo no contiene una revisión de rechazo.');
      const config=JSON.parse(await readFile(configPath,'utf8')),server=serverUrl(config.server),auth={authorization:`Bearer ${config.token}`},hash=value=>createHash('sha256').update(value).digest('hex');
      const requestId=`desktop-rejection-${hash(archive)}`;
      const entries=[...review.documents.map(item=>({id:`document:${hash(item.id)}`,category:'document',sourceId:item.id,asset:item})),...review.assets.map(item=>({id:`image:${hash(`${item.kind}\0${item.reference}`)}`,category:'image',kind:item.kind,reference:item.reference,asset:item})),...review.missingAssets.map(item=>({id:`image:${hash(`${item.kind}\0${item.reference}`)}`,category:'image',kind:item.kind,reference:item.reference,asset:{missing:true,reason:item.reason}}))];
      const descriptor=asset=>asset.missing?{expected:false,reason:asset.reason}:{expected:true};
      const snapshot={tables:review.tables,files:entries.map(({asset,...item})=>({...item,original:{expected:false,reason:'not_recorded'},content:descriptor(asset)}))};
      const response=await fetch(`${server}/api/runner/imports/rejection-check/${requestId}`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify(snapshot),redirect:'error',signal:AbortSignal.timeout(60_000)});
      if(response.status===410){process.stdout.write(JSON.stringify({removed:true})+'\n');return;}
      if(!response.ok)throw new Error(`No se pudo importar la revisión de rechazo (HTTP ${response.status}).`);
      const {id}=await response.json();let uploaded=0,missing=0;
      for(const entry of entries){if(entry.asset.missing){missing++;continue;}const key=hash(entry.id),upload=await fetch(`${server}/api/runner/imports/rejection-check-files/${id}/${key}/content`,{method:'POST',headers:{...auth,'content-type':'application/octet-stream'},body:entry.asset.bytes,redirect:'error',signal:AbortSignal.timeout(60_000)});if(!upload.ok)throw new Error(`La revisión ${id} se creó, pero un archivo no se transfirió (HTTP ${upload.status}). Repite el comando.`);uploaded++;}
      process.stdout.write(JSON.stringify({id,uploaded,missing})+'\n');return;
    }
    if (command === 'import-duplicate-check') {
      const review=inspection.duplicateCheck;if(!review.present)throw new Error('El respaldo no contiene una revisión de duplicados.');
      const config=JSON.parse(await readFile(configPath,'utf8')),server=serverUrl(config.server),auth={authorization:`Bearer ${config.token}`};
      const requestId=`desktop-duplicates-${createHash('sha256').update(archive).digest('hex')}`;
      const descriptor=asset=>asset.missing?{expected:false,reason:asset.reason}:{expected:true};
      const snapshot={tables:review.tables,files:review.files.map(file=>({id:file.id,original:descriptor(file.original),content:descriptor(file.content)}))};
      const response=await fetch(`${server}/api/runner/imports/duplicate-check/${requestId}`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify(snapshot),redirect:'error',signal:AbortSignal.timeout(60_000)});
      if(response.status===410){process.stdout.write(JSON.stringify({removed:true})+'\n');return;}
      if(!response.ok)throw new Error(`No se pudo importar la revisión (HTTP ${response.status}).`);
      const {id}=await response.json();let uploaded=0,missing=0;
      for(const file of review.files){const key=createHash('sha256').update(file.id).digest('hex');for(const kind of ['original','content']){
        const asset=file[kind];if(asset.missing){missing++;continue;}
        const upload=await fetch(`${server}/api/runner/imports/duplicate-check-files/${id}/${key}/${kind}`,{method:'POST',headers:{...auth,'content-type':'application/octet-stream'},body:asset.bytes,redirect:'error',signal:AbortSignal.timeout(60_000)});
        if(!upload.ok)throw new Error(`La revisión ${id} se creó, pero no se pudo transferir un archivo (HTTP ${upload.status}). Repite el comando para continuar.`);uploaded++;
      }}
      process.stdout.write(JSON.stringify({id,uploaded,missing})+'\n');return;
    }
    if (command === 'import-rup') {
      const rup = inspection.rup;
      if (!rup) throw new Error('El respaldo no contiene un certificado RUP actual.');
      if (rup.missing) throw new Error(`El PDF del RUP no está disponible para importar (${rup.reason}).`);
      const config = JSON.parse(await readFile(configPath, 'utf8')), server = serverUrl(config.server);
      const requestId = `desktop-rup-${createHash('sha256').update(archive).digest('hex')}`;
      const form = new FormData(); form.set('metadata', JSON.stringify({ sourceId:rup.sourceId, name: rup.name, importedAt: rup.importedAt, issuedOn: rup.issuedOn, facts: rup.facts })); form.set('pdf', new Blob([rup.bytes], { type: 'application/pdf' }), 'rup.pdf');
      const response = await fetch(`${server}/api/runner/imports/rup/${requestId}`, { method: 'POST', headers: { authorization: `Bearer ${config.token}` }, body: form, redirect: 'error', signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`No se pudo importar el RUP (HTTP ${response.status}). Si ya existe un certificado web, no se reemplaza.`);
      const result = await response.json();
      process.stdout.write(JSON.stringify({ imported: result.imported, current: result.current, factCount: rup.facts.length }) + '\n');
      return;
    }
    if (command === 'import-images') {
      const config=JSON.parse(await readFile(configPath,'utf8')),server=serverUrl(config.server),requestId=`desktop-images-${createHash('sha256').update(archive).digest('hex')}`;
      let imported=0,missing=0,removed=0;const missingImages=[];
      for(const item of inspection.imageLibrary){
        const sourceKey=createHash('sha256').update(item.sourceId).digest('hex');
        const send=async reason=>{const form=new FormData();form.set('metadata',JSON.stringify({sourceId:item.sourceId,name:item.name,createdAt:item.createdAt,...(reason?{missingReason:reason}:{})}));if(!reason)form.set('file',new Blob([item.bytes]),'image');return fetch(`${server}/api/runner/imports/image-library/${requestId}/${sourceKey}`,{method:'POST',headers:{authorization:`Bearer ${config.token}`},body:form,redirect:'error',signal:AbortSignal.timeout(60_000)});};
        let reason=item.missing?item.reason:null,response=await send(reason);if(response.status===415){reason='unsupported';response=await send(reason);}
        if(response.status===410){removed++;continue;}if(!response.ok)throw new Error(`No se pudo importar una imagen (HTTP ${response.status}). Repite el comando para continuar.`);
        if(reason){missing++;missingImages.push({sourceKey,reason});}else imported++;
      }
      process.stdout.write(JSON.stringify({imported,missing,removed,missingImages})+'\n');return;
    }
    if (command === 'import-saved-tenders') {
      const config=JSON.parse(await readFile(configPath,'utf8')),server=serverUrl(config.server),auth={authorization:`Bearer ${config.token}`};
      let imported=0,linked=0,ambiguous=0,conflicts=0,removed=0,unsupported=0,importedTasks=0,importedRequirements=0,importedComparisons=0,importedEvaluations=0,removedEvaluations=0,importedEvaluationOriginals=0,importedEvaluationTexts=0,removedEvaluationFiles=0,missingEvaluationOriginals=0,importedOpportunityTracking=0,importedRequirementSupports=0;const conflictIds=[],linkedIds=[],ambiguousIds=[],unsupportedIds=[],removedIds=[],opportunityTrackingConflicts=[],requirementSupportConflicts=[],submissionImports=[],offerDocumentImports=[],addendumImports=[];
      for(const item of inspection.savedTenders){
        if(item.association==='linked'){linked++;linkedIds.push(item.record.sourceId);continue;}if(item.association==='ambiguous'){ambiguous++;ambiguousIds.push(item.record.sourceId);continue;}if(!item.supported || (item.record.process.source!=='local'&&!item.secop)){unsupported++;unsupportedIds.push(item.record.sourceId);continue;}
        const requestId=`desktop-saved-${createHash('sha256').update(archive).update('\0').update(item.record.sourceId).digest('hex')}`;
        const response=await fetch(`${server}/api/runner/imports/saved-tenders/${requestId}`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({record:item.record,secop:item.secop}),redirect:'error',signal:AbortSignal.timeout(60_000)});
        if(response.status===409){conflicts++;conflictIds.push(item.record.sourceId);continue;}if(response.status===410){removed++;removedIds.push(item.record.sourceId);continue;}
        if(!response.ok)throw new Error(`No se pudo importar una licitación guardada (HTTP ${response.status}). Repite el comando para continuar.`);
        const result=await response.json();
        const trackingStatus=await transferOpportunityTracking(server,config.token,requestId,item.opportunityTracking);
        if(trackingStatus==='imported')importedOpportunityTracking++;else if(trackingStatus!=='absent')opportunityTrackingConflicts.push({sourceId:item.record.sourceId,status:trackingStatus});
        if(item.workflow){const workflow=await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/workflow`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify(item.workflow),redirect:'error',signal:AbortSignal.timeout(60_000)});if(!workflow.ok)throw new Error(`El proyecto ${result.projectId} se creó, pero no se pudo importar el seguimiento (HTTP ${workflow.status}). Repite el comando para continuar.`);importedTasks+=item.workflow.tasks.length;importedRequirements+=item.workflow.requirements.length;}
        const submission=await transferDesktopSubmission({data:item.submission,server,token:config.token,requestId});if(submission.requests||submission.results||submission.attachments||submission.submissions||submission.missingFiles.length||submission.omittedSubmissions.length)submissionImports.push({sourceId:item.record.sourceId,...submission});
        const supportStatus=await transferRequirementSupports(server,config.token,requestId,item.requirementSupports||[],createHash('sha256').update(archive).digest('hex'));
        if(supportStatus==='imported')importedRequirementSupports+=item.requirementSupports.length;else if(supportStatus!=='absent')requirementSupportConflicts.push({sourceId:item.record.sourceId,status:supportStatus});
        const offerDocuments=await transferDesktopOfferDocuments({data:item.offerDocuments,workflow:item.workflow,supports:item.requirementSupports||[],server,token:config.token,requestId});if(offerDocuments.documents||offerDocuments.links||offerDocuments.packageItems||offerDocuments.missingFiles.length||offerDocuments.removedFiles.length)offerDocumentImports.push({sourceId:item.record.sourceId,...offerDocuments});
        const addendum=await transferDesktopAddendum({data:item.addendum,server,token:config.token,requestId});if(addendum.status!=='absent')addendumImports.push({sourceId:item.record.sourceId,...addendum});
        if(item.economicOffer){const offer=await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/economic-offer`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify(item.economicOffer),redirect:'error',signal:AbortSignal.timeout(60_000)});if(!offer.ok)throw new Error(`El proyecto ${result.projectId} se creó, pero no se pudo importar la oferta (HTTP ${offer.status}).`);}
        for(const comparison of item.comparisons){const {certificate,...snapshot}=comparison,sourceKey=createHash('sha256').update(comparison.requirementId).digest('hex'),form=new FormData();form.set('metadata',JSON.stringify({...snapshot,certificate:{name:certificate.name,issuedOn:certificate.issuedOn,...(certificate.missing?{reason:certificate.reason}:{})}}));if(certificate.bytes)form.set('pdf',new Blob([certificate.bytes],{type:'application/pdf'}),'rup.pdf');const response=await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/rup-comparisons/${sourceKey}`,{method:'POST',headers:auth,body:form,redirect:'error',signal:AbortSignal.timeout(60_000)});if(!response.ok)throw new Error(`No se pudo transferir una comparación del proyecto ${result.projectId} (HTTP ${response.status}).`);importedComparisons++;}
        const evaluations=await transferDesktopBidEvaluation({server,token:config.token,requestId,projectId:result.projectId,data:item.bidEvaluation});importedEvaluations+=evaluations.importedRuns;removedEvaluations+=evaluations.removedRuns;importedEvaluationOriginals+=evaluations.importedOriginals;importedEvaluationTexts+=evaluations.importedTexts;removedEvaluationFiles+=evaluations.removedFiles;missingEvaluationOriginals+=evaluations.missingOriginals.length;
        imported++;
      }
      process.stdout.write(JSON.stringify({imported,linked,linkedIds,ambiguous,ambiguousIds,conflicts,conflictIds,removed,removedIds,unsupported,unsupportedIds,importedTasks,importedRequirements,importedComparisons,importedEvaluations,removedEvaluations,importedEvaluationOriginals,importedEvaluationTexts,removedEvaluationFiles,missingEvaluationOriginals,importedOpportunityTracking,opportunityTrackingConflicts,opportunityTrackingOrphanCount:inspection.opportunityTrackingOrphanCount,importedRequirementSupports,requirementSupportConflicts,requirementSupportsOrphanCount:inspection.requirementSupportsOrphanCount,submissionImports,offerDocumentImports,addendumImports})+'\n');return;
    }
    if (command === 'import-paa') {
      const config=JSON.parse(await readFile(configPath,'utf8')),server=serverUrl(config.server),requestId=`desktop-paa-${createHash('sha256').update(archive).digest('hex')}`;
      let imported=0,removed=0,conflicts=0,importedAlerts=0;const conflictPlanIds=[],removedPlanIds=[];
      for(const watch of inspection.paaWatches.items){
        const sourceKey=createHash('sha256').update(watch.planId).digest('hex');
        const response=await fetch(`${server}/api/runner/imports/paa/${requestId}/${sourceKey}`,{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify(watch),redirect:'error',signal:AbortSignal.timeout(60_000)});
        if(response.status===410){removed++;removedPlanIds.push(watch.planId);continue;}if(response.status===409){conflicts++;conflictPlanIds.push(watch.planId);continue;}
        if(!response.ok)throw new Error(`No se pudo importar un seguimiento PAA (HTTP ${response.status}). Repite el comando para continuar.`);
        imported++;importedAlerts+=watch.alerts.length;
      }
      process.stdout.write(JSON.stringify({imported,removed,conflicts,conflictPlanIds,removedPlanIds,importedAlerts,orphanAlerts:inspection.paaWatches.orphanAlertCount})+'\n');return;
    }
    if (command === 'import-certificates') {
      const config = JSON.parse(await readFile(configPath, 'utf8')), server = serverUrl(config.server), requestId = `desktop-certificates-${createHash('sha256').update(archive).digest('hex')}`;
      let imported = 0, removed = 0, importedImages = 0, removedImages = 0; const missingImages = [];
      for (const { imageCount: _imageCount, images, ...certificate } of inspection.companyCertificates) {
        const sourceKey = createHash('sha256').update(certificate.sourceId).digest('hex');
        const response = await fetch(`${server}/api/runner/imports/certificates/${requestId}/${sourceKey}`, { method:'POST', headers:{ authorization:`Bearer ${config.token}`, 'content-type':'application/json' }, body:JSON.stringify(certificate), redirect:'error', signal:AbortSignal.timeout(60_000) });
        if (response.status === 410) { removed++; continue; }
        if (!response.ok) throw new Error(`No se pudo importar un certificado (HTTP ${response.status}). Repite el comando para continuar.`);
        imported++;
        for (const image of images) {
          const imageKey=createHash('sha256').update(image.sourceId).digest('hex');
          if (image.missing) { missingImages.push({imageKey,reason:image.reason}); continue; }
          const { bytes, ...metadata }=image, form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set('file',new Blob([bytes]),'image');
          const result=await fetch(`${server}/api/runner/imports/certificates/${requestId}/images/${imageKey}`,{method:'POST',headers:{authorization:`Bearer ${config.token}`},body:form,redirect:'error',signal:AbortSignal.timeout(60_000)});
          if(result.status===410){removedImages++;continue;}
          if(result.status===415){missingImages.push({imageKey,reason:'unsupported'});continue;}
          if(!result.ok)throw new Error(`No se pudo importar una imagen de certificado (HTTP ${result.status}). Repite el comando para continuar.`);
          importedImages++;
        }
      }
      process.stdout.write(JSON.stringify({imported,removed,importedImages,removedImages,missingImages}) + '\n'); return;
    }
    if (command === 'import-knowledge') {
      const config = JSON.parse(await readFile(configPath, 'utf8')), server = serverUrl(config.server), requestId = `desktop-knowledge-${createHash('sha256').update(archive).digest('hex')}`;
      const mimeTypes = { '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.markdown': 'text/markdown', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.doc': 'application/msword', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls': 'application/vnd.ms-excel' };
      let importedFolders = 0, importedDocuments = 0, importedMissingDocuments = 0, importedItems = 0; const missingDocuments = [], removedDocuments = [], removedFolders = [];
      for (const folder of inspection.knowledge.folders) {
        const folderKey = createHash('sha256').update(folder.sourceId).digest('hex');
        const response = await fetch(`${server}/api/runner/imports/knowledge/${requestId}/folders/${folderKey}`, { method: 'POST', headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ sourceId: folder.sourceId, name: folder.name, createdAt: folder.createdAt }), redirect: 'error', signal: AbortSignal.timeout(60_000) });
        if (response.status === 410) { removedFolders.push(folder.name); continue; }
        if (!response.ok) throw new Error(`No se pudo importar una carpeta de biblioteca (HTTP ${response.status}). Repite el comando para continuar.`);
        importedFolders++;
        for (const document of folder.documents) {
          const documentKey = createHash('sha256').update(document.sourceId).digest('hex'), form = new FormData();
          const contentType = mimeTypes[extname(document.name.trim()).toLowerCase()] || 'application/octet-stream';
          form.set('metadata', JSON.stringify({ sourceId: document.sourceId, folderSourceId: folder.sourceId, name: document.name, createdAt: document.createdAt, items: document.items, contentType, ...(document.missing ? { missingReason: document.reason } : {}) }));
          if (document.bytes) form.set('file', new Blob([document.bytes], { type: contentType }), 'original');
          const uploaded = await fetch(`${server}/api/runner/imports/knowledge/${requestId}/documents/${documentKey}`, { method: 'POST', headers: { authorization: `Bearer ${config.token}` }, body: form, redirect: 'error', signal: AbortSignal.timeout(60_000) });
          if (uploaded.status === 410) { removedDocuments.push(document.name); continue; }
          if (!uploaded.ok) throw new Error(`No se pudo importar un documento de biblioteca (HTTP ${uploaded.status}). Repite el comando para continuar.`);
          if (document.missing) { importedMissingDocuments++; missingDocuments.push({ name: document.name, reason: document.reason, itemCount: document.items.length }); } else importedDocuments++;
          importedItems += document.items.length;
        }
      }
      process.stdout.write(JSON.stringify({ importedFolders, importedDocuments, importedMissingDocuments, importedItems, missingDocuments, removedDocuments, removedFolders }) + '\n');
      return;
    }
    const projectId = option('--project', ''), project = inspection.projects.find(item => item.sourceId === projectId);
    if (!project) throw new Error('El proyecto no existe en el respaldo; consulta inspect-backup.');
    const config = JSON.parse(await readFile(configPath, 'utf8')), server = serverUrl(config.server);
    const requestId = `desktop-plan-${createHash('sha256').update(archive).update('\0').update(project.sourceId).digest('hex')}`;
    const response = await fetch(`${server}/api/runner/imports/technical-plan`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}`, 'idempotency-key': requestId }, body: JSON.stringify({ title: project.title, nodes: project.nodes }), redirect: 'error', signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`No se pudo importar el plan (${response.status}).`);
    const result = await response.json();
    const opportunityTrackingStatus=await transferOpportunityTracking(server,config.token,requestId,project.opportunityTracking);
    let importedSecop=false,secopStatus=project.secopIssue || null;
    if(project.secop){
      const secopResponse=await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/secop`,{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify(project.secop),redirect:'error',signal:AbortSignal.timeout(60_000)});
      if(secopResponse.status===409)secopStatus='conflict';else if(secopResponse.status===410)secopStatus='removed';else if(!secopResponse.ok)throw new Error(`El proyecto ${result.project.id} se importó, pero no se pudo transferir el vínculo SECOP (HTTP ${secopResponse.status}). Repite el comando para continuar.`);else importedSecop=true;
    }
    const mimeTypes = { '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.doc': 'application/msword', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xls': 'application/vnd.ms-excel' };
    let importedDocuments = 0; const removedDocuments = [];
    try {
      for (const document of project.documents) {
        const sourceKey = createHash('sha256').update(document.sourceId).digest('hex');
        const status = await transferDesktopPlanDocument({server,token:config.token,requestId,sourceKey,name:document.name,contentType:mimeTypes[extname(document.name.trim()).toLowerCase()] || 'application/octet-stream',bytes:document.bytes});
        if (status === 'removed') { removedDocuments.push(document.name); continue; }
        importedDocuments++;
      }
    } catch (error) { throw new Error(`El proyecto ${result.project.id} se creó, pero solo se transfirieron ${importedDocuments} de ${project.documents.length} documentos. Repite el mismo comando para continuar. ${error.message}`); }
    let importedAssets = 0;
    try {
      for (const asset of project.assets) {
        const sourceKey = createHash('sha256').update(JSON.stringify([asset.kind, asset.reference])).digest('hex'), digest = createHash('sha256').update(asset.bytes).digest('hex');
        const upload = await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/assets/${sourceKey}`, { method: 'POST', headers: { authorization: `Bearer ${config.token}`, 'x-asset-kind': asset.kind, 'x-asset-reference': encodeURIComponent(asset.reference), 'x-content-sha256': digest, 'content-type': 'application/octet-stream' }, body: asset.bytes, redirect: 'error', signal: AbortSignal.timeout(60_000) });
        if (!upload.ok) throw new Error(`HTTP ${upload.status}`);
        importedAssets++;
      }
    } catch (error) { throw new Error(`El proyecto ${result.project.id} se creó, pero solo se transfirieron ${importedAssets} de ${project.assets.length} imágenes. Repite el mismo comando para continuar. ${error.message}`); }
    if (project.facts.length) {
      const facts = await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/facts`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` }, body: JSON.stringify({ groups: project.facts }), redirect: 'error', signal: AbortSignal.timeout(60_000) });
      if (!facts.ok) throw new Error(`El proyecto ${result.project.id} y sus documentos se importaron, pero no se pudieron importar los hechos (HTTP ${facts.status}). Si ya existen hechos en la web, no se reemplazan; revísalos antes de continuar.`);
    }
    if (project.chatMessages.length) {
      const response = await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` }, body: JSON.stringify({ messages: project.chatMessages }), redirect: 'error', signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`El proyecto ${result.project.id} se importó, pero no se pudo transferir el historial de consultas (HTTP ${response.status}). Repite el mismo comando para continuar.`);
    }
    if (project.analyses.length) {
      const response = await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/analyses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` }, body: JSON.stringify({ analyses: project.analyses }), redirect: 'error', signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`El proyecto ${result.project.id} se importó, pero no se pudieron transferir los análisis (HTTP ${response.status}). Repite el mismo comando para continuar.`);
    }
    if (project.workflow) {
      const workflow = await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/workflow`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` }, body: JSON.stringify(project.workflow), redirect: 'error', signal: AbortSignal.timeout(60_000) });
      if (!workflow.ok) throw new Error(`El proyecto ${result.project.id} se importó, pero no se pudo transferir su seguimiento (HTTP ${workflow.status}). Si ya hay tareas o requisitos en la web, no se reemplazan.`);
    }
    const submission=await transferDesktopSubmission({data:project.submission,server,token:config.token,requestId});
    const requirementSupportsStatus=await transferRequirementSupports(server,config.token,requestId,project.requirementSupports||[],createHash('sha256').update(archive).digest('hex'));
    const offerDocuments=await transferDesktopOfferDocuments({data:project.offerDocuments,workflow:project.workflow,supports:project.requirementSupports||[],server,token:config.token,requestId});
    const addendum=await transferDesktopAddendum({data:project.addendum,server,token:config.token,requestId});
    let importedComparisons = 0;
    try {
      for (const comparison of project.comparisons) {
        const { certificate, ...snapshot } = comparison, sourceKey = createHash('sha256').update(comparison.requirementId).digest('hex');
        const form = new FormData(); form.set('metadata', JSON.stringify({ ...snapshot, certificate: { name: certificate.name, issuedOn: certificate.issuedOn, ...(certificate.missing ? { reason: certificate.reason } : {}) } }));
        if (certificate.bytes) form.set('pdf', new Blob([certificate.bytes], { type: 'application/pdf' }), 'rup.pdf');
        const response = await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/rup-comparisons/${sourceKey}`, { method: 'POST', headers: { authorization: `Bearer ${config.token}` }, body: form, redirect: 'error', signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        importedComparisons++;
      }
    } catch (error) { throw new Error(`El proyecto ${result.project.id} se importó, pero solo se transfirieron ${importedComparisons} de ${project.comparisons.length} comparaciones. Repite el mismo comando para continuar. ${error.message}`); }
    if (project.economicOffer) {
      const offer = await fetch(`${server}/api/runner/imports/technical-plan/${requestId}/economic-offer`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` }, body: JSON.stringify(project.economicOffer), redirect: 'error', signal: AbortSignal.timeout(60_000) });
      if (!offer.ok) throw new Error(`El proyecto ${result.project.id} se importó, pero no se pudo transferir su oferta económica (HTTP ${offer.status}). Si ya hay una oferta web, no se reemplaza.`);
    }
    const bidEvaluation = await transferDesktopBidEvaluation({server,token:config.token,requestId,projectId:result.project.id,data:project.bidEvaluation});
    const missingAssets = project.missingAssets.map(item => ['outside_backup', 'unsafe_path'].includes(item.reason) ? { kind: item.kind, reason: item.reason } : item);
    process.stdout.write(JSON.stringify({ project: result.project, sourceId: project.sourceId, nodeCount: project.nodes.length, opportunityTrackingStatus, requirementSupportsStatus, requirementSupportsOrphanCount:inspection.requirementSupportsOrphanCount, importedDocuments, removedDocuments, importedAssets, missingAssets, importedFactGroups: project.facts.length, importedAnalyses: project.analyses.length, importedSecop, secopStatus, importedSecopAlerts: importedSecop ? project.secop.alerts.length : 0, importedChatMessages: project.chatMessages.length, importedTasks: project.workflow?.tasks.length || 0, importedRequirements: project.workflow?.requirements.length || 0, importedComparisons, missingComparisonSources: project.comparisons.filter(item => item.certificate.missing).length, importedEconomicOffer: !!project.economicOffer, bidEvaluation, submission, offerDocuments, addendum, missingDocuments: project.missingDocuments, omitted: inspection.omitted.filter(item => item !== 'global-facts' && item !== 'rup-comparisons' && (item!=='submission-tracking'||submission.missingFiles.length||submission.omittedSubmissions.length) && (item!=='offer-support-files'||offerDocuments.missingFiles.length||offerDocuments.removedFiles.length)) }) + '\n');
    return;
  }
  if (command === 'pair') {
    if (await hasOutboxFiles(`${configPath}.outbox`) || await hasOutboxFiles(`${configPath}.drafts`) || await hasOutboxFiles(`${configPath}.artifact-meta`) || await hasArtifactOutboxFiles(`${configPath}.artifacts`)) throw new Error('Hay resultados o etapas técnicas pendientes o rechazados; expórtalos y retíralos antes de volver a emparejar.');
    const server = serverUrl(option('--server', ''));
    const name = option('--name', hostname());
    if(process.stdin.isTTY)process.stdout.write('Pega el código de conexión y pulsa Enter: ');
    let code = '';
    for await (const chunk of process.stdin) { const text=chunk.toString('utf8'),end=text.indexOf('\n');code+=end<0?text:text.slice(0,end);if(code.length>4096)throw new Error('El código de conexión no es válido.');if(end>=0)break; }
    code=code.trim();if(!/^[a-f0-9]{64}$/.test(code))throw new Error('El código de conexión no es válido.');
    const paired = await post(`${server}/api/runners/pair`, { code, name });
    await saveConfig({ server, runnerId: paired.runner.id, token: paired.token, ...(access ? {cloudflareAccess:access} : {}) });
    process.stdout.write('Runner emparejado.\n');
    return;
  }
  if (command === 'run-once' || command === 'run') {
    const cleanup=await cleanupOrphanedWorkspaces();
    if(cleanup.removed)process.stdout.write(`Espacios temporales abandonados eliminados: ${cleanup.removed}.\n`);
    if(cleanup.failed)process.stderr.write('No se pudieron limpiar algunos espacios temporales; se volverá a intentar al iniciar.\n');
    process.env.SAVIA_HEADLESS_RUNNER = '1';
    const { createTenderChatHandler, isTenderChatAvailable } = await import('./tender-chat.mjs');
    const { createTechnicalPlanHandler } = await import('./technical-plan.mjs');
    const { createTechnicalPlanBatchHandler } = await import('./technical-plan-batch.mjs');
    const { createTechnicalAnalysisHandler } = await import('./technical-analysis.mjs');
    const { createOutlineRootsHandler } = await import('./technical-outline-roots.mjs');
    const { createOutlineExpandHandler } = await import('./technical-outline-expand.mjs');
    const { createTemplateExtractionHandler } = await import('./template-extraction.mjs');
    const { createGlobalFactsHandler } = await import('./global-facts.mjs');
    const { createRequirementSuggestionsHandler } = await import('./requirement-suggestions.mjs');
    const { createKnowledgeAnalysisHandler } = await import('./knowledge-analysis.mjs');
    const { createDuplicateJobHandler } = await import('./duplicate-check.mjs');
    const { createBidEvaluationJobHandler } = await import('./bid-evaluation.mjs');
    const { createBlindJobHandler, createBlindFixJobHandler } = await import('./blind-check.mjs');
    const { createProposalSuggestionsHandler } = await import('./proposal-suggestions.mjs');
    const { createRupAnalysisHandler } = await import('./rup-analysis.mjs');
    const { createCompanyDossierHandler } = await import('./company-dossier.mjs');
    const { createOpportunityAnalysisHandler } = await import('./opportunity-analysis.mjs');
    const { createRejectionJobHandler } = await import('./rejection-check.mjs');
    const { createFeasibilityContentHandler } = await import('./feasibility-content.mjs');
    const { createFeasibilityParametersHandler } = await import('./feasibility-parameters.mjs');
    const { createFeasibilityOutlineHandler } = await import('./feasibility-outline.mjs');
    const { createFeasibilityAnalysisHandler } = await import('./feasibility-analysis.mjs');
    const { createFeasibilityExtractHandler } = await import('./feasibility-extract.mjs');
    const { createFeasibilityExportHandler } = await import('./feasibility-export.mjs');
    const { createSecopZipHandler } = await import('./secop-zip.mjs');
    const { createWordExportHandler, resolvePackagedHelper } = await import('./technical-plan-export.mjs');
    const {renderWordFormatPreview}=await import('./word-format-preview.mjs');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const server = serverUrl(config.server);
    const outbox = createOutbox({ directory: `${configPath}.outbox`, server, runnerId: config.runnerId, token: config.token });
    const draftOutbox = createOutbox({ directory: `${configPath}.drafts`, server, runnerId: config.runnerId, token: config.token });
    const artifactOutbox = createArtifactOutbox({ directory: `${configPath}.artifacts`, server, runnerId: config.runnerId, token: config.token });
    const artifactMetaOutbox = createOutbox({ directory: `${configPath}.artifact-meta`, server, runnerId: config.runnerId, token: config.token });
    const handlers = { 'secop.import-zip': createSecopZipHandler(), 'feasibility.extract-sources': createFeasibilityExtractHandler(), 'feasibility.export-word': createFeasibilityExportHandler(), 'economic-offer.calculate': payload => economicOffer.calculateOffer(payload.draft), 'duplicate-check.analyze': createDuplicateJobHandler() };
    if (resolvePackagedHelper(resolve(dirname(fileURLToPath(import.meta.url)), '..'))) { handlers['blind-check.inspect'] = createBlindJobHandler(); handlers['blind-check.fix'] = createBlindFixJobHandler(); handlers['blind-check.fix-report'] = createBlindFixJobHandler(); handlers['proposal-review.apply-suggestions'] = createProposalSuggestionsHandler(); if (isTenderChatAvailable()) handlers['blind-check.fix-ai'] = createBlindFixJobHandler(); handlers['technical-plan.export-word'] = createWordExportHandler(); handlers['word-format.preview'] = async (payload,context) => {const result=await renderWordFormatPreview(payload.format,{language:payload.language,signal:context.signal});return {docx:Buffer.from(result.bytes).toString('base64')};}; if (isTenderChatAvailable()) handlers['technical-plan.extract-template'] = createTemplateExtractionHandler(); }
    if (isTenderChatAvailable()) { handlers['feasibility.generate-content'] = createFeasibilityContentHandler(); handlers['feasibility.generate-parameters'] = createFeasibilityParametersHandler(); handlers['feasibility.generate-outline'] = createFeasibilityOutlineHandler(); handlers['feasibility.analyze'] = createFeasibilityAnalysisHandler(); handlers['bid-evaluation.analyze'] = createBidEvaluationJobHandler(); handlers['rejection-check.extract'] = createRejectionJobHandler(); handlers['rejection-check.analyze'] = createRejectionJobHandler(); handlers['tender-chat.send'] = createTenderChatHandler(); handlers['technical-plan.generate-section'] = createTechnicalPlanHandler(); handlers['technical-plan.generate-batch'] = createTechnicalPlanBatchHandler(); handlers['technical-plan.analyze'] = createTechnicalAnalysisHandler(); handlers['technical-plan.generate-roots'] = createOutlineRootsHandler(); handlers['technical-plan.generate-facts'] = createGlobalFactsHandler(); handlers['technical-plan.expand-outline'] = createOutlineExpandHandler(); handlers['rup.analyze'] = createRupAnalysisHandler(); handlers['company-dossier.extract'] = createCompanyDossierHandler(); handlers['opportunity.analyze'] = createOpportunityAnalysisHandler(); handlers['knowledge.analyze'] = createKnowledgeAnalysisHandler(); handlers['requirements.suggest'] = createRequirementSuggestionsHandler(); }
    else process.stderr.write('Faltan las herramientas locales de Pi; las consultas de documentos permanecerán en espera.\n');
    const recover = async () => {
      const recoveredDrafts = await recoverTechnicalDrafts({ server, token: config.token, outbox: draftOutbox });
      if (recoveredDrafts.delivered) process.stdout.write(`Etapas técnicas recuperadas: ${recoveredDrafts.delivered}.\n`);
      if (recoveredDrafts.rejected.length) process.stderr.write(`Se conservaron ${recoveredDrafts.rejected.length} etapas técnicas rechazadas. Consulta outbox-list --kind draft y outbox-export --kind draft.\n`);
      const recovered = await recoverPending({ server, token: config.token, outbox, artifactOutbox, artifactMetaOutbox });
      if (recovered.delivered) process.stdout.write(`Resultados recuperados: ${recovered.delivered}.\n`);
      if (recovered.rejected.length) process.stderr.write(`Se conservaron ${recovered.rejected.length} resultados rechazados. Consulta outbox-list y outbox-export.\n`);
      const recoveredArtifacts = await recoverArtifactPending({server,token:config.token,outbox,artifactOutbox,artifactMetaOutbox});
      if(recoveredArtifacts.delivered)process.stdout.write(`Copias recuperadas: ${recoveredArtifacts.delivered}.\n`);
      if(recoveredArtifacts.rejected.length)process.stderr.write(`Se conservaron ${recoveredArtifacts.rejected.length} copias para exportación manual.\n`);
    };
    const execute=()=>runOnce({ server, token: config.token, handlers, outbox, draftOutbox, artifactOutbox, artifactMetaOutbox, renewIntervalMs: 3000, captureConsole: true, onActivity: event => protocolWrite(JSON.stringify({type:'savia-activity',...event})+'\n'), onWarning: message => process.stderr.write(`${message}\n`) });
    if (command === 'run-once') {
      if(isMainThread||!workerData?.saviaPoolSlot)await recover();
      const outcome = await execute();
      if(!isMainThread&&workerData?.saviaPoolSlot)parentPort?.postMessage({type:'savia-slot-result',outcome});
      process.stdout.write(outcome.state === 'idle' ? 'No hay tareas compatibles.\n' : `Tarea ${outcome.state}.\n`);
      if (outcome.state === 'failed') process.exitCode = 1;
      return;
    }
    const pollOption = option('--poll-ms', '');
    const interval = pollOption ? Number(pollOption) : undefined;
    if (interval!==undefined && (!Number.isInteger(interval) || interval < 100 || interval > 300_000)) throw new Error('El intervalo debe estar entre 100 y 300000 ms.');
    const statusPath = `${configPath}.status`;
    const publishStatus = () => writeFile(statusPath, JSON.stringify({pid:process.pid,runnerId:config.runnerId,updatedAt:Date.now()}), {encoding:'utf8',mode:0o600}).catch(() => {});
    await publishStatus();
    const statusTimer = setInterval(() => void publishStatus(), 3000);
    statusTimer.unref();
    const stop = new AbortController();
    const previewWake=createPreviewWake();
    const stopPreviewWake=handlers['word-format.preview']?connectPreviewWake({server,token:config.token,cloudflareAccess:access,wake:previewWake,signal:stop.signal}):()=>previewWake.close();
    const scheduler=createOpportunityRunnerScheduler({send:async signal=>{const response=await fetch(`${server}/api/runner/opportunity-suggestions/due`,{method:'POST',headers:{authorization:`Bearer ${config.token}`},redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])});if(!response.ok)throw new Error('No se pudo comprobar la programación.');}});
    const cleanupScheduler=createOpportunityRunnerScheduler({intervalMs:60*60_000,send:async signal=>{const response=await fetch(`${server}/api/runner/imports/cleanup`,{method:'POST',headers:{authorization:`Bearer ${config.token}`},redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});if(!response.ok)throw new Error('No se pudo limpiar las cargas pendientes.');}});
    const shutdown = () => {stop.abort();scheduler.stop();cleanupScheduler.stop();};
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    try {
      let fatal;
      await runWorkerPool({signal:stop.signal,run:()=>runIsolatedWorker({cli:fileURLToPath(import.meta.url),configPath,cloudflareAccess:access,stdout:{write:protocolWrite},stderr:process.stderr}),recover,intervalOverride:interval,wait:ms=>previewWake.wait(ms),
        getLimit:async()=>{const response=await fetch(`${server}/api/runners/heartbeat`,{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify({supportsConcurrency:true}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Object.assign(new Error('No se pudo consultar la configuración del runner.'),{status:response.status});return (await response.json()).maxAgents??1;},
        onIdle:()=>{if(handlers['opportunity.analyze'])void scheduler.tick();void cleanupScheduler.tick();},
        onOutcome:outcome=>{if(outcome.state!=='idle')process.stdout.write(`Tarea ${outcome.state}.\n`);},
        onError:error=>{if(error.code==='OUTBOX_DRAFT_PENDING'||error.code==='OUTBOX_ARTIFACT_PENDING')process.stderr.write('Hay una copia cifrada pendiente; se intentará recuperar.\n');else if(String(error.code||'').startsWith('OUTBOX_')||error.status>=400&&error.status<500&&error.status!==404){fatal=error;stop.abort();}else process.stderr.write('No se pudo contactar al servidor; se reintentará.\n');}
      });
      if(fatal)throw fatal;
    } finally {
      clearInterval(statusTimer);
      try { const status=JSON.parse(await readFile(statusPath,'utf8')); if(status.pid===process.pid) await rm(statusPath,{force:true}); } catch {}
      stopPreviewWake();
      scheduler.stop();
      cleanupScheduler.stop();
      process.removeListener('SIGINT', shutdown);
      process.removeListener('SIGTERM', shutdown);
    }
    return;
  }
  if (command === 'heartbeat') {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const server = serverUrl(config.server);
    await post(`${server}/api/runners/heartbeat`, {}, config.token);
    process.stdout.write('Runner conectado.\n');
    return;
  }
  if (['outbox-list', 'outbox-export', 'outbox-discard'].includes(command)) {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const kind=option('--kind','result'); if(!['result','draft','artifact'].includes(kind))throw new Error('El tipo debe ser result, draft o artifact.');
    const outbox = kind==='artifact' ? createArtifactOutbox({directory:`${configPath}.artifacts`,server:serverUrl(config.server),runnerId:config.runnerId,token:config.token}) : createOutbox({ directory: `${configPath}.${kind==='draft'?'drafts':'outbox'}`, server: serverUrl(config.server), runnerId: config.runnerId, token: config.token });
    if (command === 'outbox-list') {
      const items = await outbox.list();
      process.stdout.write(items.length ? items.map(item => `${item.jobId} ${item.state}`).join('\n') + '\n' : 'No hay resultados pendientes.\n');
    } else if (command === 'outbox-export') {
      await outbox.export(option('--job', ''), option('--output', ''));
      process.stdout.write('Resultado exportado.\n');
    } else {
      const jobId = option('--job', ''), state = option('--state', '');
      if (!(await outbox.list()).some(item => item.jobId === jobId && item.state === state)) throw new Error('Resultado no encontrado.');
      if(kind==='artifact'){const meta=createOutbox({directory:`${configPath}.artifact-meta`,server:serverUrl(config.server),runnerId:config.runnerId,token:config.token});for(const item of await meta.list())if(item.jobId===jobId)await meta.remove(jobId,item.state);}
      await outbox.remove(jobId, state);
      process.stdout.write('Copia retirada.\n');
    }
    return;
  }
  throw new Error('Uso: doctor, pair, capture-account-projects, restore-account-projects, capture-account-components, restore-account-components, service-install, service-remove, heartbeat, run-once, run, outbox-list, outbox-export, outbox-discard, capture-project-components, restore-project-components, read-account-preferences, capture-account-preferences, restore-account-preferences, capture-account-company-profile, restore-account-company-profile, capture-account-image-library, restore-account-image-library, capture-account-rup, restore-account-rup, capture-account-certificates, restore-account-certificates, capture-account-export-format, restore-account-export-format, capture-account-knowledge, restore-account-knowledge, capture-account-paa, restore-account-paa, capture-account-experience, restore-account-experience, capture-account-feasibility, restore-account-feasibility, discard-account-feasibility-restore, list-desktop-companies, create-backup, inspect-backup, import-feasibility, import-plan, import-rup, import-knowledge, import-certificates, import-company-profile, import-company-experience, import-export-format, import-export-templates, import-paa, import-saved-tenders, import-images, import-duplicate-check, import-rejection-check o cleanup-imports.');
}

async function executeMain() {
  const guarded = ['pair','run','run-once','outbox-export','outbox-discard'].includes(command) && (isMainThread||!workerData?.saviaPoolSlot);
  const release = guarded ? await (await import('./runner-lock.mjs')).acquireRunnerLock(configPath) : null;
  try { await main(); } finally { if (release) await release(); }
}

executeMain().catch(error => {
  if(!isMainThread&&workerData?.saviaPoolSlot)parentPort?.postMessage({type:'savia-slot-error',code:typeof error?.code==='string'?error.code:'',status:Number.isInteger(error?.status)?error.status:undefined});
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
