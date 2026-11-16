#!/usr/bin/env node
// Real-provider evaluation with synthetic text only; the key remains in memory.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import evaluation from '../client/scripts/tender-chat-evaluation.cjs';
import {syntheticConsistencyScenario,assessSyntheticConsistency} from './synthetic-consistency-check.mjs';

const configPath=process.env.SAVIA_EVAL_CONFIG||join(homedir(),'Library','Application Support','savia-licitaciones','user_config.json');let configured;
try{configured=JSON.parse(await readFile(configPath,'utf8'));}catch{console.error('No se pudo leer la configuración local.');process.exit(2);}
const check=evaluation.inspectEvaluationConfig(configured);if(!check.ready){console.error(`La configuración no permite la evaluación: ${check.reason}.`);process.exit(2);}
const profile=configured.text_model_profiles?.['opencode-go']||{},base=(configured.base_url??profile.base_url??'https://opencode.ai/inference/go/openai/v1').replace(/\/+$/,'');if(base!=='https://opencode.ai/inference/go/openai/v1'){console.error('La ruta configurada de OpenCode Go no es compatible.');process.exit(2);}
if(!process.argv.includes('--run')){console.log('Configuración apta. Usa --run para ejecutar una revisión sintética con el proveedor configurado.');process.exit(0);}
if(process.env.SAVIA_HEADLESS_RUNNER!=='1'){console.error('Para ejecutar la evaluación establece SAVIA_HEADLESS_RUNNER=1.');process.exit(2);}
const credential={provider:'opencode-go',secret:configured.api_key??profile.api_key,model:configured.model_name??profile.model_name};
const {createTechnicalConsistencyReviewer}=await import('./technical-consistency.mjs'),{createAiService}=await import('../client/electron/services/aiService.cjs');const metrics=[],tokenCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const reviewer=createTechnicalConsistencyReviewer({createAiService:options=>{const service=createAiService(options),run=service.runAgentChatCompletion.bind(service);service.runAgentChatCompletion=async invocation=>{const started=performance.now();try{const result=await run(invocation),u=result?.usage;metrics.push({durationMs:Math.round(performance.now()-started),inputTokens:tokenCount(u?.input_tokens??u?.prompt_tokens),outputTokens:tokenCount(u?.output_tokens??u?.completion_tokens)});return result;}catch(error){metrics.push({durationMs:Math.round(performance.now()-started),failed:true});throw error;}};return service;}});
const {chapters,references,globalFacts}=syntheticConsistencyScenario,started=performance.now();
try{const result=await reviewer({language:'es',dataProcessingConsent:true},{job:{id:'evaluacion-coherencia-sintetica'},signal:AbortSignal.timeout(90000),getCredential:async()=>credential,askUser:async()=>{throw new Error('La evaluación no admite preguntas interactivas.');}},{chapters,references,globalFacts});
 const {detected,resolved,reported}=assessSyntheticConsistency(result);
 console.log(JSON.stringify({ok:true,detected,resolved,reported,modifiedSections:result.sections.length,unresolvedIssues:result.unresolved.length,elapsedMs:Math.round(performance.now()-started),requests:metrics}));
}catch(error){console.error(JSON.stringify({ok:false,reason:error?.name==='TimeoutError'?'timeout':'evaluation_failed',elapsedMs:Math.round(performance.now()-started),requests:metrics}));process.exitCode=1;}
