#!/usr/bin/env node
// Explicit real-provider evaluation: synthetic text only. Never print credentials
// or model responses; the configured key stays in memory.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import evaluation from '../client/scripts/tender-chat-evaluation.cjs';
import words from '../client/electron/utils/wordCount.cjs';

const configPath=process.env.SAVIA_EVAL_CONFIG||join(homedir(),'Library','Application Support','savia-licitaciones','user_config.json');
let configured;
try{configured=JSON.parse(await readFile(configPath,'utf8'));}catch{console.error('No se pudo leer la configuración local.');process.exit(2);}
const check=evaluation.inspectEvaluationConfig(configured);
if(!check.ready){console.error(`La configuración no permite la evaluación: ${check.reason}.`);process.exit(2);}
const profile=configured.text_model_profiles?.['opencode-go']||{},base=(configured.base_url??profile.base_url??'https://opencode.ai/inference/go/openai/v1').replace(/\/+$/,'');
if(base!=='https://opencode.ai/inference/go/openai/v1'){console.error('La ruta configurada de OpenCode Go no es compatible.');process.exit(2);}
if(!process.argv.includes('--run')){console.log('Configuración apta. Usa --run para ejecutar una solicitud sintética con el proveedor configurado.');process.exit(0);}
if(process.env.SAVIA_HEADLESS_RUNNER!=='1'){console.error('Para ejecutar la evaluación establece SAVIA_HEADLESS_RUNNER=1.');process.exit(2);}
const credential={provider:'opencode-go',secret:configured.api_key??profile.api_key,model:configured.model_name??profile.model_name};
const {createTechnicalWordAdjuster}=await import('./technical-word-adjuster.mjs');
const {createAiService}=await import('../client/electron/services/aiService.cjs');
const metrics=[],tokenCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const adjust=createTechnicalWordAdjuster({createAiService:options=>{const service=createAiService(options),run=service.runAgentChatCompletion.bind(service);service.runAgentChatCompletion=async invocation=>{const started=performance.now();try{const result=await run(invocation);const u=result?.usage;metrics.push({durationMs:Math.round(performance.now()-started),inputTokens:tokenCount(u?.input_tokens??u?.prompt_tokens),outputTokens:tokenCount(u?.output_tokens??u?.completion_tokens)});return result;}catch(error){metrics.push({durationMs:Math.round(performance.now()-started),failed:true});throw error;}};return service;}});
const content=`La coordinación del proyecto organizará reuniones de seguimiento con el equipo responsable. Cada encuentro permitirá revisar el progreso y documentar los acuerdos necesarios para continuar. Los participantes compartirán sus observaciones sobre las actividades realizadas y describirán los próximos pasos de manera clara.\n\nLa persona responsable consolidará las observaciones en un registro de trabajo. El equipo revisará ese registro para identificar necesidades de coordinación, aclarar responsabilidades y hacer seguimiento a las decisiones tomadas. Las dudas se comunicarán oportunamente para que puedan resolverse durante las reuniones.\n\nEl registro mantendrá una descripción de las tareas y sus responsables. La información se actualizará durante la ejecución para facilitar la comunicación entre los participantes y apoyar la revisión del avance. La documentación estará disponible para las personas autorizadas del equipo.`;
const chapter={id:'seccion-sintetica',title:'Coordinación',content},before=words.countReadableWords(content),target=Math.round(before*.7),started=performance.now();
try{
 const result=await adjust({language:'es',dataProcessingConsent:true},{job:{id:'evaluacion-sintetica'},signal:AbortSignal.timeout(90000),getCredential:async()=>credential,askUser:async()=>{throw new Error('La evaluación no admite preguntas interactivas.');}},{chapter,targetWords:target});
 console.log(JSON.stringify({ok:true,beforeWords:before,targetWords:target,afterWords:words.countReadableWords(result.content),elapsedMs:Math.round(performance.now()-started),requests:metrics}));
}catch(error){console.error(JSON.stringify({ok:false,reason:error?.name==='TimeoutError'?'timeout':'evaluation_failed',elapsedMs:Math.round(performance.now()-started),requests:metrics}));process.exitCode=1;}
