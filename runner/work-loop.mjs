import {readLocalOpenCodeConfig} from './local-opencode-config.mjs';
import {fetchRunnerConfig} from './runner-config.mjs';
import {captureProcessConsole} from './process-console.mjs';
import {activityCodes,activityDetails} from './job-activity.mjs';
import {createPiUsageCollector} from './pi-usage.mjs';
import {uploadLargeArtifact} from './large-artifact-upload.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { TaskInputError } from './task-errors.mjs';
import { createManagedWorkspace } from './managed-workspaces.mjs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

async function request(server, token, path, payload, options = {}) {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 15_000);
  const response = await fetch(`${server}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload), redirect: 'error',
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const error = new Error(`El servidor rechazó la solicitud (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  if (options.fileStream) { if (!response.body) throw new Error('No se recibió el documento.'); return { body: response.body, contentType: response.headers.get('content-type') || '', name: decodeURIComponent(response.headers.get('x-savia-file-name') || '') }; }
  if (options.fileInfo) return { bytes: await response.arrayBuffer(), contentType: response.headers.get('content-type') || '', name: decodeURIComponent(response.headers.get('x-savia-file-name') || '') };
  return options.binary ? response.arrayBuffer() : response.json();
}

function redact(value, secrets) {
  if (typeof value === 'string') return secrets.reduce((text, secret) => text.split(secret).join('[redactado]'), value);
  if (Array.isArray(value)) return value.map(item => redact(item, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [redact(key, secrets), redact(item, secrets)]));
  return value;
}
function transient(error) { return !error?.status || error.status === 429 || error.status >= 500; }
const rejectedStatus = error => [400, 404, 409, 413, 422].includes(error?.status);

export async function recoverPending({ server, token, outbox, artifactOutbox, artifactMetaOutbox, requestTimeoutMs = 15_000 }) {
  const result = { delivered: 0, rejected: [] };
  let items;
  try { items = await outbox.list(); }
  catch { throw Object.assign(new Error('No se puede acceder a los resultados cifrados pendientes. Revisa los permisos de la configuración.'), { code: 'OUTBOX_UNAVAILABLE' }); }
  for (const item of items) {
    if (item.state !== 'pending') continue;
    let completion;
    try { completion = await outbox.read(item.jobId, 'pending'); }
    catch { throw Object.assign(new Error('No se puede descifrar un resultado pendiente. Conserva la configuración y revisa el token, el servidor y el archivo.'), { code: 'OUTBOX_UNREADABLE' }); }
    try {
      await request(server, token, `/api/runner/jobs/${item.jobId}/complete`, completion, { timeoutMs: requestTimeoutMs });
    } catch (error) {
      if (!rejectedStatus(error)) throw error;
      try { await outbox.reject(item.jobId); }
      catch { throw Object.assign(new Error('No se pudo conservar el resultado rechazado. Revisa los permisos de la configuración.'), { code: 'OUTBOX_UNAVAILABLE' }); }
      result.rejected.push(item.jobId);
      continue;
    }
    if (artifactMetaOutbox && completion.status === 'succeeded') await artifactMetaOutbox.remove(item.jobId, 'pending');
    if (artifactOutbox && completion.status === 'succeeded') { try { await artifactOutbox.remove(item.jobId); } catch { throw Object.assign(new Error('El resultado se entregó, pero no se pudo limpiar su copia cifrada.'),{code:'OUTBOX_UNAVAILABLE'}); } }
    try { await outbox.remove(item.jobId, 'pending'); }
    catch { throw Object.assign(new Error('El resultado se entregó, pero no se pudo limpiar la copia cifrada. Revisa los permisos de la configuración.'), { code: 'OUTBOX_UNAVAILABLE' }); }
    result.delivered++;
  }
  return result;
}

export async function recoverArtifactPending({server,token,artifactOutbox,artifactMetaOutbox,outbox,uploadLargeArtifactFn=uploadLargeArtifact,requestTimeoutMs=15_000,renewIntervalMs=20_000}) {
  const result={delivered:0,rejected:[]};
  for(const item of await artifactMetaOutbox.list()) {
    if(item.state!=='pending')continue;
    const saved=await artifactMetaOutbox.read(item.jobId,'pending');
    if(saved?.status!=='artifact-pending'||typeof saved.lease!=='string'||!saved.result?.resultBase)throw Object.assign(new Error('Los datos de recuperación de la copia no son válidos.'),{code:'OUTBOX_UNREADABLE'});
    const lease=saved.lease,base=`/api/runner/jobs/${item.jobId}`;
    try { await request(server,token,`${base}/renew`,{lease},{timeoutMs:requestTimeoutMs}); }
    catch(error) { if(!rejectedStatus(error))throw error;await artifactMetaOutbox.reject(item.jobId);result.rejected.push(item.jobId);continue; }
    const stop=new AbortController(),abort=new AbortController();
    const guard=(async()=>{while(!stop.signal.aborted){try{await delay(renewIntervalMs,undefined,{signal:stop.signal});if(stop.signal.aborted)return;await request(server,token,`${base}/renew`,{lease},{signal:stop.signal,timeoutMs:requestTimeoutMs});}catch(error){if(!stop.signal.aborted)abort.abort(error);return;}}})();
    let workspace;
    try {
      workspace=await createManagedWorkspace(undefined,'artifact-recovery');const path=join(workspace,'artifact.docx');
      await artifactOutbox.export(item.jobId,path);abort.signal.throwIfAborted();
      const artifact=await uploadLargeArtifactFn({server,token,jobId:item.jobId,lease,path,signal:abort.signal});
      let report;
      if(saved.result.report!==null){
        const response=await fetch(`${server}${base}/repair-report`,{method:'POST',headers:{authorization:`Bearer ${token}`,'x-savia-lease':lease,'content-type':'application/json'},body:JSON.stringify(saved.result.report),redirect:'error',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(requestTimeoutMs)])});
        if(!response.ok)throw Object.assign(new Error(`El servidor rechazó el informe (${response.status}).`),{status:response.status});report=(await response.json()).report;
      }
      abort.signal.throwIfAborted();const completion={lease,status:'succeeded',result:{...saved.result.resultBase,artifactId:artifact.id,...(report?{reportId:report.id,reportAvailable:true}:{})}};
      await outbox.save(item.jobId,completion);
      await request(server,token,`${base}/complete`,completion,{signal:abort.signal,timeoutMs:requestTimeoutMs});
      await artifactMetaOutbox.remove(item.jobId,'pending');await artifactOutbox.remove(item.jobId);await outbox.remove(item.jobId,'pending');result.delivered++;
    } catch(error) {
      if(rejectedStatus(error)){await artifactMetaOutbox.reject(item.jobId);result.rejected.push(item.jobId);continue;}
      throw error;
    } finally {stop.abort();await guard;if(workspace)await rm(workspace,{recursive:true,force:true});}
  }
  return result;
}

function technicalStageRequest(jobId,saved,lease=saved?.lease){
 if(saved?.status==='technical-word-plan'){if(typeof lease!=='string'||!saved.result||!Object.hasOwn(saved.result,'plan')||(saved.result.plan!==null&&typeof saved.result.plan!=='object'))throw new Error('Etapa técnica inválida.');return {path:`/api/runner/jobs/${jobId}/technical-batch/word-plan`,payload:{lease,plan:saved.result.plan}};}
 if(saved?.status==='technical-word-adjustment'){const {nodeId,targetWords,content}=saved.result||{};if(typeof lease!=='string'||typeof nodeId!=='string'||!nodeId||!Number.isSafeInteger(targetWords)||targetWords<1||typeof content!=='string'||!content.trim())throw new Error('Etapa técnica inválida.');return {path:`/api/runner/jobs/${jobId}/technical-batch/word-adjustment/${encodeURIComponent(nodeId)}`,payload:{lease,targetWords,content}};}
 if(saved?.status==='technical-ledger'){const entry=saved.result?.entry;if(typeof lease!=='string'||typeof entry?.id!=='string'||!entry.id||typeof entry.reference!=='boolean'||typeof entry.fingerprint!=='string'||!Array.isArray(entry.facts)||!Array.isArray(entry.issues))throw new Error('Etapa técnica inválida.');return {path:`/api/runner/jobs/${jobId}/technical-batch/ledger/${encodeURIComponent(entry.id)}`,payload:{lease,entry}};}
 if(saved?.status==='technical-consistency'){if(typeof lease!=='string'||!saved.result?.review||!Array.isArray(saved.result.review.checked_ids)||!Array.isArray(saved.result.review.sections)||!Array.isArray(saved.result.review.unresolved))throw new Error('Etapa técnica inválida.');return {path:`/api/runner/jobs/${jobId}/technical-batch/consistency`,payload:{lease,review:saved.result.review}};}
 if(typeof lease!=='string'||(saved?.status==='technical-draft'?(typeof saved?.result?.nodeId!=='string'||!saved.result.nodeId||typeof saved.result.content!=='string'):(saved?.status!=='technical-plan'||!saved.result?.plans||!Array.isArray(saved.result.plans.plans))))throw new Error('Etapa técnica inválida.');
 return saved.status==='technical-plan'?{path:`/api/runner/jobs/${jobId}/technical-batch/plan`,payload:{lease,plans:saved.result.plans}}:{path:`/api/runner/jobs/${jobId}/technical-batch/drafts/${encodeURIComponent(saved.result.nodeId)}`,payload:{lease,content:saved.result.content}};
}
export async function recoverTechnicalDrafts({server,token,outbox,requestTimeoutMs=15_000}) {
  const result={delivered:0,rejected:[]};let items;
  try{items=await outbox.list();}catch{throw Object.assign(new Error('No se puede acceder a las etapas técnicas cifradas pendientes.'),{code:'OUTBOX_UNAVAILABLE'});}
  for(const item of items){if(item.state!=='pending')continue;let saved;
    let path,payload;try{saved=await outbox.read(item.jobId,'pending');({path,payload}=technicalStageRequest(item.jobId,saved));}catch{throw Object.assign(new Error('No se puede descifrar una etapa técnica pendiente.'),{code:'OUTBOX_UNREADABLE'});}
    try{await request(server,token,path,payload,{timeoutMs:requestTimeoutMs});}
    catch(error){if(!rejectedStatus(error))throw error;try{await outbox.reject(item.jobId);}catch{throw Object.assign(new Error('No se pudo conservar la etapa técnica rechazada.'),{code:'OUTBOX_UNAVAILABLE'});}result.rejected.push(item.jobId);continue;}
    try{await outbox.remove(item.jobId,'pending');}catch{throw Object.assign(new Error('La etapa técnica se entregó, pero no se pudo retirar la copia cifrada.'),{code:'OUTBOX_UNAVAILABLE'});}result.delivered++;
  }return result;
}

const runnerConfigCache = new Map();

export function clearRunnerConfigCache() {
  runnerConfigCache.clear();
}

async function loadCachedRunnerConfig({ server, token, cacheMs = 60_000, timeoutMs = 5_000, fetchRunnerConfigFn = fetchRunnerConfig }) {
  const key = `${server}\0${token}`;
  const cached = runnerConfigCache.get(key);
  const now = Date.now();
  if (cached && cacheMs > 0 && now - cached.fetchedAt < cacheMs) {
    return cached.value;
  }
  const value = await fetchRunnerConfigFn({ apiUrl: server, runnerToken: token, timeoutMs });
  if (cacheMs > 0) {
    runnerConfigCache.set(key, { value, fetchedAt: now });
  }
  return value;
}

export async function runOnce({ server, token, handlers, outbox, draftOutbox, artifactOutbox, artifactMetaOutbox, uploadLargeArtifactFn = uploadLargeArtifact, onWarning = () => {}, onActivity = () => {}, captureConsole = false, renewIntervalMs = 20_000, retryDelayMs = 1_000, deliveryTimeoutMs = 120_000, leaseSafetyMs = 5_000, requestTimeoutMs = 15_000, questionPollMs = 2_000, localCredentialLoader = readLocalOpenCodeConfig, fetchRunnerConfigFn = fetchRunnerConfig, runnerConfigCacheMs = 60_000 }) {
  const localCredential = await localCredentialLoader();
  const runnerConfig = await loadCachedRunnerConfig({
    server,
    token,
    cacheMs: runnerConfigCacheMs,
    timeoutMs: Math.min(requestTimeoutMs, 5_000),
    fetchRunnerConfigFn,
  });
  const claimStarted = performance.now();
  const claimed = await request(server, token, '/api/runner/jobs/claim', { kinds: Object.keys(handlers), localModel: !!localCredential, localModelSelection: true, supportsConcurrency:true, supportsBidDocuments:true }, { timeoutMs: requestTimeoutMs });
  if (!claimed.job) return { state: 'idle', ...(Number.isInteger(claimed.pollAfterMs) && claimed.pollAfterMs >= 10000 && claimed.pollAfterMs <= 300000 ? {pollAfterMs: claimed.pollAfterMs} : {}) };
  const { job, lease } = claimed;
  let usedModel;
  const duration = claimed.leaseDurationMs;
  const leaseDurationMs = Number.isFinite(duration) && duration >= 100 && duration <= 300_000 ? duration : 60_000;
  const safety = Math.min(Math.max(0, leaseSafetyMs), leaseDurationMs / 3);
  const secrets = [token, lease].filter(value => typeof value === 'string' && value);
  const abort = new AbortController();
  const stop = new AbortController();
  const saveTechnicalBatch = async (path, payload) => {
    const deadline = performance.now() + deliveryTimeoutMs;
    while (true) {
      abort.signal.throwIfAborted();
      try { return await request(server, token, path, payload, { signal: abort.signal, timeoutMs: requestTimeoutMs }); }
      catch (error) {
        if (abort.signal.aborted || !transient(error) || performance.now() >= deadline) throw error;
        await delay(Math.min(retryDelayMs, Math.max(0, deadline - performance.now())), undefined, { signal: abort.signal });
      }
    }
  };
  const requestWithRetry = async (path, payload, options = {}) => {
    const maxAttempts = 4;
    for (let attempt = 1; ; attempt++) {
      abort.signal.throwIfAborted();
      try {
        return await request(server, token, path, payload, { signal: abort.signal, timeoutMs: requestTimeoutMs, ...options });
      } catch (error) {
        if (abort.signal.aborted || !transient(error) || attempt >= maxAttempts) throw error;
        await delay(retryDelayMs * attempt, undefined, { signal: abort.signal });
      }
    }
  };
  const saveRecoverableTechnicalBatch = async (path,payload,status,result) => {
    if(draftOutbox){try{await draftOutbox.save(job.id,{lease,status,result});}catch{throw Object.assign(new Error('No se pudo conservar la etapa técnica cifrada.'),{code:'OUTBOX_UNAVAILABLE'});}}
    try{const response=await saveTechnicalBatch(path,payload);if(draftOutbox)await draftOutbox.remove(job.id,'pending');return response;}
    catch(error){if(draftOutbox)throw Object.assign(new Error(error?.message||'No se pudo entregar la etapa técnica.'),{code:'OUTBOX_DRAFT_PENDING',status:error?.status});throw error;}
  };
  let leaseError, artifactSaved=false;
  let progress;
  let activitySequence=0;
  const activity=[];
  const reportActivity=(code,details)=>{if(!activityCodes.includes(code)||activitySequence>=10000)return;const event={sequence:++activitySequence,code,at:new Date().toISOString(),details:redact(activityDetails(details),secrets)};if(job.projectId)activity.push(event);onActivity({jobId:job.id,kind:job.kind,...event});};
  const reportConsole = entry => {
    const clean = JSON.stringify(entry, (key,value) => /^(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)$/i.test(key) ? '[redactado]' : value, 2);
    const text = redact(clean || '', secrets).replace(/Bearer\s+[^\s"']+/gi,'Bearer [redactado]');
    const totalParts=Math.max(1,Math.ceil(text.length/8000));
    for(let part=0;part<totalParts;part++)reportActivity('agent.console',{text:text.slice(part*8000,(part+1)*8000),event:entry.event,tool:entry.tool,callId:entry.callId,part:part+1,totalParts});
  };
  reportActivity('preparing');
  let secopCommitPending = false;
  let leaseDeadline = claimStarted + leaseDurationMs - safety;
  const guard = (async () => {
    let nextDelay = renewIntervalMs;
    while (!stop.signal.aborted) {
      const remaining = leaseDeadline - performance.now();
      if (remaining <= 0) { leaseError = new Error('No se pudo renovar la concesión a tiempo.'); abort.abort(leaseError); return; }
      try { await delay(Math.min(nextDelay, remaining), undefined, { signal: stop.signal }); }
      catch { if (stop.signal.aborted) return; throw new Error('No se pudo programar la renovación.'); }
      if (stop.signal.aborted) return;
      if (performance.now() >= leaseDeadline) { leaseError = new Error('No se pudo renovar la concesión a tiempo.'); abort.abort(leaseError); return; }
      try {
        const renewalStarted = performance.now();
        const renewalTimeout = Math.max(1, Math.min(requestTimeoutMs, Math.floor(leaseDeadline - renewalStarted)));
        const events=activity.slice(0,100);
        await request(server, token, `/api/runner/jobs/${job.id}/renew`, { lease, ...(progress ? { progress } : {}), ...(events.length?{events}:{}) }, { signal: stop.signal, timeoutMs: renewalTimeout });
        activity.splice(0,events.length);
        leaseDeadline = renewalStarted + leaseDurationMs - safety;
        nextDelay = renewIntervalMs;
      } catch (error) {
        if (stop.signal.aborted) return;
        // The ZIP commit atomically completes the job. A concurrent renewal
        // may therefore receive 409 before its response reaches the runner.
        if (secopCommitPending && error?.status === 409) return;
        if (!transient(error)) { leaseError = error; abort.abort(error); return; }
        nextDelay = retryDelayMs;
      }
    }
  })();
  try {
    if(draftOutbox&&job.kind==='technical-plan.generate-batch'){
      let items;try{items=await draftOutbox.list();}catch{throw Object.assign(new Error('No se puede consultar la etapa técnica cifrada.'),{code:'OUTBOX_UNAVAILABLE'});}
      if(items.some(item=>item.jobId===job.id&&item.state==='rejected')){
        let stage;try{stage=technicalStageRequest(job.id,await draftOutbox.read(job.id,'rejected'),lease);}catch{throw Object.assign(new Error('No se puede descifrar la etapa técnica conservada.'),{code:'OUTBOX_UNREADABLE'});}
        try{await saveTechnicalBatch(stage.path,stage.payload);}catch(error){throw Object.assign(new Error('No se pudo recuperar la etapa técnica de esta tarea; conserva la copia para revisión.'),{code:transient(error)?'OUTBOX_DRAFT_PENDING':'OUTBOX_CONFLICT',status:error?.status});}
        try{await draftOutbox.remove(job.id,'rejected');}catch{throw Object.assign(new Error('No se pudo retirar la etapa técnica recuperada.'),{code:'OUTBOX_UNAVAILABLE'});}
      }
    }
    let status = 'succeeded';
    let result;
    const collectUsage = ['feasibility.analyze','feasibility.generate-outline','feasibility.generate-parameters','feasibility.generate-content'].includes(job.kind) ? createPiUsageCollector() : null;
    const restoreConsole=captureConsole?captureProcessConsole(reportConsole):()=>{};
    const previousRunnerConfigJson = process.env.SAVIA_RUNNER_CONFIG_JSON;
    process.env.SAVIA_RUNNER_CONFIG_JSON = JSON.stringify(runnerConfig);
    try {
      result = await handlers[job.kind](job.payload, {
        signal: abort.signal,
        job,
        runnerConfig,
        reportUsage: collectUsage?.add,
        reportActivity,
        reportConsole,
        reportProgress: stage => { if (['preparing', 'reading', 'ocr', 'generating'].includes(stage)) {if(progress!==stage)reportActivity(stage);progress = stage;} },
        askUser: async (question, signal) => {
          const combined = signal ? AbortSignal.any([abort.signal, signal]) : abort.signal;
          const details = redact({ toolCallId: question.tool_call_id || crypto.randomUUID(), question: question.question, options: question.options }, secrets);
          const path = `/api/runner/jobs/${job.id}/questions`;
          const send = async (url, payload) => {
            while (true) {
              combined.throwIfAborted();
              try { return await request(server, token, url, payload, { signal: combined, timeoutMs: requestTimeoutMs }); }
              catch (error) { if (combined.aborted || !transient(error)) throw error; await delay(retryDelayMs, undefined, { signal: combined }); }
            }
          };
          let current = (await send(path, { lease, ...details })).question;
          const questionId = current.id;
          while (current.state !== 'answered') {
            await delay(questionPollMs, undefined, { signal: combined });
            current = (await send(`${path}/${encodeURIComponent(questionId)}`, { lease })).question;
          }
          return current.response;
        },
        getCredential: async () => {
          const credential = ((job.kind==='opportunity.analyze'&&!job.credentialId)||job.payload.localRunner===true) ? localCredential : (await requestWithRetry(`/api/runner/jobs/${job.id}/credential`, { lease })).credential;
          if (!credential) throw new TaskInputError('No se encontró el modelo local de OpenCode en este equipo.');
          if (typeof credential?.secret === 'string' && credential.secret) secrets.push(credential.secret);
          if (credential === localCredential && credential.provider === 'opencode-go' && typeof claimed.localModel === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(claimed.localModel)) { usedModel = claimed.localModel; return {...credential, model:claimed.localModel}; }
          if (typeof credential.model === 'string') usedModel = credential.model;
          return credential;
        },
        getFile: fileId => requestWithRetry(`/api/runner/jobs/${job.id}/files/${encodeURIComponent(fileId)}`, { lease }, { binary: true }),
        getFileInfo: fileId => requestWithRetry(`/api/runner/jobs/${job.id}/files/${encodeURIComponent(fileId)}`, { lease }, { fileInfo: true }),
        getFileStream: fileId => requestWithRetry(`/api/runner/jobs/${job.id}/files/${encodeURIComponent(fileId)}`, { lease }, { timeoutMs: 300_000, fileStream: true }),
        getPlanContext: () => requestWithRetry(`/api/runner/jobs/${job.id}/plan-context`, { lease }),
        getTechnicalBatchContext: () => requestWithRetry(`/api/runner/jobs/${job.id}/technical-batch`, { lease }),
        getTechnicalBatchLedger: async nodeId => (await saveTechnicalBatch(`/api/runner/jobs/${job.id}/technical-batch/ledger/${encodeURIComponent(nodeId)}`,{lease,fetch:true})).entry,
        getTechnicalBatchSection: async (nodeId,stage) => (await saveTechnicalBatch(`/api/runner/jobs/${job.id}/technical-batch/section/${encodeURIComponent(nodeId)}`,{lease,...(stage?{stage}:{})})).section,
        saveTechnicalBatchPlans: plans => saveRecoverableTechnicalBatch(`/api/runner/jobs/${job.id}/technical-batch/plan`,{lease,plans},'technical-plan',{plans}),
        saveTechnicalBatchDraft: (nodeId, content) => saveRecoverableTechnicalBatch(`/api/runner/jobs/${job.id}/technical-batch/drafts/${encodeURIComponent(nodeId)}`,{lease,content},'technical-draft',{nodeId,content}),
        saveTechnicalBatchConsistency: review => saveRecoverableTechnicalBatch(`/api/runner/jobs/${job.id}/technical-batch/consistency`,{lease,review},'technical-consistency',{review}),
        saveTechnicalBatchWordPlan: plan => saveRecoverableTechnicalBatch(`/api/runner/jobs/${job.id}/technical-batch/word-plan`,{lease,plan},'technical-word-plan',{plan}),
        getTechnicalBatchWordAdjustment: async nodeId => (await saveTechnicalBatch(`/api/runner/jobs/${job.id}/technical-batch/word-adjustment/${encodeURIComponent(nodeId)}`,{lease,fetch:true})).adjustment,
        saveTechnicalBatchWordAdjustment: (nodeId,targetWords,content) => saveRecoverableTechnicalBatch(`/api/runner/jobs/${job.id}/technical-batch/word-adjustment/${encodeURIComponent(nodeId)}`,{lease,targetWords,content},'technical-word-adjustment',{nodeId,targetWords,content}),
        saveTechnicalBatchLedger: entry => saveRecoverableTechnicalBatch(`/api/runner/jobs/${job.id}/technical-batch/ledger/${encodeURIComponent(entry.id)}`,{lease,entry},'technical-ledger',{entry}),
        getPlanAsset: assetId => requestWithRetry(`/api/runner/jobs/${job.id}/plan-assets/${encodeURIComponent(assetId)}`, { lease }, { binary: true }),
        getBidTemplate: () => requestWithRetry(`/api/runner/jobs/${job.id}/template`, { lease }, { binary: true }),
        getOpportunityDocuments: (candidateId, language) => requestWithRetry(`/api/runner/jobs/${job.id}/opportunity-context`, { lease, candidateId, language }),
        getOpportunitySources: () => requestWithRetry(`/api/runner/jobs/${job.id}/opportunity-context`, { lease }),
        assertOpportunitySources: () => requestWithRetry(`/api/runner/jobs/${job.id}/opportunity-context?check=1`, { lease }),
        getRequirementSources: () => requestWithRetry(`/api/runner/jobs/${job.id}/requirements-context`, { lease }),
        assertRequirementSources: () => requestWithRetry(`/api/runner/jobs/${job.id}/requirements-context?check=1`, { lease }),
        getKnowledgeDocumentInfo: documentId => requestWithRetry(`/api/runner/jobs/${job.id}/knowledge-documents/${encodeURIComponent(documentId)}`, { lease }, { fileInfo: true }),
        getKnowledgeFile: () => requestWithRetry(`/api/runner/jobs/${job.id}/knowledge-source`, { lease }, { fileInfo: true }),
        getCompanyDossierFile: sourceId => requestWithRetry(`/api/runner/jobs/${job.id}/company-dossier/${encodeURIComponent(sourceId)}`, { lease }, { fileInfo: true }),
        assertKnowledgeCurrent: () => requestWithRetry(`/api/runner/jobs/${job.id}/knowledge-source?check=1`, { lease }),
        getFeasibilityContentContext: () => requestWithRetry(`/api/runner/jobs/${job.id}/feasibility-content-context`, { lease }),
        getFeasibilityContentDraft: id => requestWithRetry(`/api/runner/jobs/${job.id}/feasibility-content-drafts/${encodeURIComponent(id)}`, { lease, fetch: true }),
        saveFeasibilityContentDraft: async (id,content,fallback) => {const deadline=performance.now()+deliveryTimeoutMs;while(true){abort.signal.throwIfAborted();try{return await request(server,token,`/api/runner/jobs/${job.id}/feasibility-content-drafts/${encodeURIComponent(id)}`,{lease,content,...(fallback===undefined?{}:{fallback})},{signal:abort.signal,timeoutMs:requestTimeoutMs});}catch(error){if(abort.signal.aborted||!transient(error)||performance.now()>=deadline)throw error;await delay(Math.min(retryDelayMs,Math.max(0,deadline-performance.now())),undefined,{signal:abort.signal});}}},
        saveFeasibilityContentReview: async (id,content,fallback) => {const deadline=performance.now()+deliveryTimeoutMs;while(true){abort.signal.throwIfAborted();try{return await request(server,token,`/api/runner/jobs/${job.id}/feasibility-content-reviews/${encodeURIComponent(id)}`,{lease,content,fallback},{signal:abort.signal,timeoutMs:requestTimeoutMs});}catch(error){if(abort.signal.aborted||!transient(error)||performance.now()>=deadline)throw error;await delay(Math.min(retryDelayMs,Math.max(0,deadline-performance.now())),undefined,{signal:abort.signal});}}},
        getFeasibilityParametersContext: () => requestWithRetry(`/api/runner/jobs/${job.id}/feasibility-parameters-context`, { lease }),
        getFeasibilityOutlineContext: () => requestWithRetry(`/api/runner/jobs/${job.id}/feasibility-outline-context`, { lease }),
        getFeasibilityAnalysisContext: () => requestWithRetry(`/api/runner/jobs/${job.id}/feasibility-analysis`, { lease, projectFilesSupported: true }),
        getFeasibilityAnalysisSource: id => requestWithRetry(`/api/runner/jobs/${job.id}/feasibility-analysis/${encodeURIComponent(id)}`, { lease }, { binary: true }),
        getFeasibilityProjectFile: id => requestWithRetry(`/api/runner/jobs/${job.id}/feasibility-analysis/${encodeURIComponent(id)}`, { lease }, { fileInfo: true }),
        getFeasibilityOriginal: id => requestWithRetry(`/api/runner/jobs/${job.id}/feasibility-original/${encodeURIComponent(id)}`, { lease }, { fileInfo: true }),
        stageSecopFile: async (index, file) => {
    const deadline = performance.now() + deliveryTimeoutMs;
          while (true) {
            abort.signal.throwIfAborted();
            try {
              const response = await fetch(`${server}/api/runner/jobs/${job.id}/secop-parts/${index}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-savia-lease': lease, 'x-savia-name': encodeURIComponent(file.name), 'content-type': 'application/octet-stream' }, body: file.bytes, redirect: 'error', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(requestTimeoutMs)]) });
              if (!response.ok) throw Object.assign(new Error(`El servidor rechazó el archivo (${response.status}).`), { status: response.status });
              return await response.json();
            } catch (error) {
              if (abort.signal.aborted || !transient(error) || performance.now() >= deadline) throw error;
              await delay(Math.min(retryDelayMs, Math.max(0, deadline - performance.now())), undefined, { signal: abort.signal });
            }
          }
        },
        commitSecopFiles: async info => {
    const deadline = performance.now() + deliveryTimeoutMs;
          secopCommitPending = true;
          while (true) {
            abort.signal.throwIfAborted();
            try { const result = await request(server, token, `/api/runner/jobs/${job.id}/secop-commit`, { lease, ...info }, { signal: abort.signal, timeoutMs: requestTimeoutMs }); stop.abort(); return result; }
            catch (error) {
              if (abort.signal.aborted || !transient(error) || performance.now() >= deadline) throw error;
              await delay(Math.min(retryDelayMs, Math.max(0, deadline - performance.now())), undefined, { signal: abort.signal });
            }
          }
        },
        assertFeasibilityExtractionCurrent: () => request(server, token, `/api/runner/jobs/${job.id}/feasibility-extraction-check`, { lease }, { signal: abort.signal, timeoutMs: requestTimeoutMs }),
        uploadFeasibilityText: async (id,bytes,options) => {const deadline=performance.now()+deliveryTimeoutMs;while(true){abort.signal.throwIfAborted();try{const response=await fetch(`${server}/api/runner/jobs/${job.id}/feasibility-text/${encodeURIComponent(id)}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'x-savia-lease':lease,'content-type':'text/plain; charset=utf-8',...(options?{'x-savia-image-count':String(options.imageCount)}:{})},body:bytes,redirect:'error',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(requestTimeoutMs)])});if(!response.ok)throw Object.assign(new Error(`El servidor rechazó el texto (${response.status}).`),{status:response.status});return response.json();}catch(error){if(abort.signal.aborted||!transient(error)||performance.now()>=deadline)throw error;await delay(Math.min(retryDelayMs,Math.max(0,deadline-performance.now())),undefined,{signal:abort.signal});}}},
        uploadFeasibilityImage: async (id,imageHash,bytes) => {const deadline=performance.now()+deliveryTimeoutMs;while(true){abort.signal.throwIfAborted();try{const response=await fetch(`${server}/api/runner/jobs/${job.id}/feasibility-image/${encodeURIComponent(id)}/${encodeURIComponent(imageHash)}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'x-savia-lease':lease,'content-type':'application/octet-stream'},body:bytes,redirect:'error',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(requestTimeoutMs)])});if(!response.ok)throw Object.assign(new Error(`El servidor rechazó la imagen (${response.status}).`),{status:response.status});return response.json();}catch(error){if(abort.signal.aborted||!transient(error)||performance.now()>=deadline)throw error;await delay(Math.min(retryDelayMs,Math.max(0,deadline-performance.now())),undefined,{signal:abort.signal});}}},
        getFeasibilityAsset: id => request(server, token, `/api/runner/jobs/${job.id}/feasibility-assets/${encodeURIComponent(id)}`, { lease }, { signal: abort.signal, timeoutMs: requestTimeoutMs, binary: true }),
        getFeasibilityContext: () => request(server, token, `/api/runner/jobs/${job.id}/feasibility-context`, { lease }, { signal: abort.signal, timeoutMs: requestTimeoutMs }),
        getRupPdf: () => request(server, token, `/api/runner/jobs/${job.id}/rup`, { lease }, { signal: abort.signal, timeoutMs: requestTimeoutMs, binary: true }),
        assertRupCurrent: () => request(server, token, `/api/runner/jobs/${job.id}/rup?check=1`, { lease }, { signal: abort.signal, timeoutMs: requestTimeoutMs }),
        uploadAccountArtifact: async bytes => {
          const deadline=performance.now()+deliveryTimeoutMs;
          while(true){abort.signal.throwIfAborted();try{
            const response=await fetch(`${server}/api/runner/jobs/${job.id}/account-artifact`,{method:'POST',headers:{authorization:`Bearer ${token}`,'x-savia-lease':lease,'content-type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},body:bytes,redirect:'error',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(requestTimeoutMs)])});
            if(!response.ok)throw Object.assign(new Error(`El servidor rechazó el archivo (${response.status}).`),{status:response.status});return (await response.json()).artifact;
          }catch(error){if(abort.signal.aborted||!transient(error)||performance.now()>=deadline)throw error;await delay(Math.min(retryDelayMs,Math.max(0,deadline-performance.now())),undefined,{signal:abort.signal});}}
        },
        uploadArtifactFile: async (path, recovery) => {
          if(artifactOutbox){try{await artifactOutbox.save(job.id,path);artifactSaved=true;}catch{throw Object.assign(new Error('No se pudo conservar la copia cifrada; revisa el almacenamiento y las copias pendientes.'),{code:'OUTBOX_UNAVAILABLE'});}}
          if(artifactMetaOutbox && recovery){try{await artifactMetaOutbox.save(job.id,{lease,status:'artifact-pending',result:redact(recovery,secrets)});}catch{throw Object.assign(new Error('No se pudo guardar el informe cifrado; conserva la copia para exportación manual.'),{code:'OUTBOX_ARTIFACT_PENDING'});}}
          try{return await uploadLargeArtifactFn({server,token,jobId:job.id,lease,path,signal:abort.signal});}catch(error){if(artifactSaved)throw Object.assign(new Error('La copia cifrada se conservó para recuperación manual. Usa outbox-list --kind artifact.'),{code:'OUTBOX_ARTIFACT_PENDING'});throw error;}
        },
        uploadArtifact: async (bytes, contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') => {
    const deadline = performance.now() + deliveryTimeoutMs;
          while (true) {
            abort.signal.throwIfAborted();
            try {
              const response = await fetch(`${server}/api/runner/jobs/${job.id}/artifact`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-savia-lease': lease, 'content-type': contentType }, body: bytes, redirect: 'error', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(requestTimeoutMs)]) });
              if (!response.ok) throw Object.assign(new Error(`El servidor rechazó el archivo (${response.status}).`), { status: response.status });
              return (await response.json()).artifact;
            } catch (error) {
              if (abort.signal.aborted || !transient(error) || performance.now() >= deadline) throw error;
              await delay(Math.min(retryDelayMs, Math.max(0, deadline - performance.now())), undefined, { signal: abort.signal });
            }
          }
        },
        uploadRepairReport: async (bytes, contentType = 'application/json') => {
    const deadline = performance.now() + deliveryTimeoutMs;
          while (true) {
            abort.signal.throwIfAborted();
            try {
              const response = await fetch(`${server}/api/runner/jobs/${job.id}/repair-report`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-savia-lease': lease, 'content-type': contentType }, body: bytes, redirect: 'error', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(requestTimeoutMs)]) });
              if (!response.ok) throw Object.assign(new Error(`El servidor rechazó el archivo (${response.status}).`), { status: response.status });
              return (await response.json()).report;
            } catch (error) {
              if (abort.signal.aborted || !transient(error) || performance.now() >= deadline) throw error;
              await delay(Math.min(retryDelayMs, Math.max(0, deadline - performance.now())), undefined, { signal: abort.signal });
            }
          }
        },
      });
    } catch (error) {
      reportConsole({event:'process.error',text:String(error?.stack||error?.message||error)});
      if(String(error?.code||'').startsWith('OUTBOX_'))throw error;
      if(artifactSaved)throw Object.assign(new Error('La copia cifrada se conservó para recuperación.'),{code:'OUTBOX_ARTIFACT_PENDING'});
      status = 'failed';
      const providerError = job.payload?.language === 'en' ? 'The task could not be completed with the configured provider.' : 'No se pudo completar la tarea con el proveedor configurado.';
      result = { message: error instanceof TaskInputError ? error.message : job.credentialId ? providerError : String(error?.message || 'No se pudo completar la tarea.') };
    }
    finally {
      if (previousRunnerConfigJson === undefined) delete process.env.SAVIA_RUNNER_CONFIG_JSON;
      else process.env.SAVIA_RUNNER_CONFIG_JSON = previousRunnerConfigJson;
      restoreConsole();
    }
    if (leaseError && status === 'failed') throw leaseError;
    if (collectUsage && result && typeof result === 'object' && !Array.isArray(result)) { const usage = collectUsage.snapshot(); if (usage.reportedCalls || usage.unreportedCalls) result = { ...result, usage }; }
    if (job.kind === 'tender-chat.send' && status === 'succeeded' && usedModel && result && typeof result === 'object' && !Array.isArray(result)) result = { ...result, model: usedModel };
    const completion = { lease, status, result: redact(result, secrets) };
    let saved = false;
    if (outbox) {
      try { await outbox.save(job.id, completion); saved = true; }
      catch { onWarning('No se pudo guardar una copia cifrada temporal del resultado.'); }
    }
    if (leaseError) {
      if (saved && rejectedStatus(leaseError)) {
        try { await outbox.reject(job.id); }
        catch { onWarning('No se pudo mover el resultado rechazado; se conserva la copia cifrada temporal.'); }
      }
      throw leaseError;
    }
    reportActivity(status==='succeeded'?'job.succeeded':'job.failed');
    if(activity.length){try{const remainingEvents=[...activity];for(let i=0;i<remainingEvents.length;i+=100)await request(server,token,`/api/runner/jobs/${job.id}/renew`,{lease,events:remainingEvents.slice(i,i+100)},{timeoutMs:requestTimeoutMs});}catch{onWarning('No se pudo guardar el último tramo de actividad.');}}
    const deadline = performance.now() + deliveryTimeoutMs;
    while (true) {
      try {
        await request(server, token, `/api/runner/jobs/${job.id}/complete`, completion, { timeoutMs: requestTimeoutMs });
        if (artifactSaved && status === 'succeeded') { try { if(artifactMetaOutbox)await artifactMetaOutbox.remove(job.id,'pending');await artifactOutbox.remove(job.id); } catch { onWarning('La tarea terminó, pero no se pudo limpiar su copia cifrada local.'); } }
        if (saved) {
          try { await outbox.remove(job.id, 'pending'); }
          catch { onWarning('El resultado se entregó, pero no se pudo limpiar su copia cifrada temporal.'); }
        }
        return { state: status, jobId: job.id };
      } catch (error) {
        if (!transient(error) || performance.now() >= deadline) {
          if (saved && rejectedStatus(error)) {
            try { await outbox.reject(job.id); }
            catch { onWarning('No se pudo mover el resultado rechazado; se conserva la copia cifrada temporal.'); }
          }
          throw error;
        }
        await delay(Math.min(retryDelayMs, Math.max(0, deadline - performance.now())));
      }
    }
  } finally {
    stop.abort();
    await guard;
  }
}
