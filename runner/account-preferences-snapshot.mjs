import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createComponentSnapshot,verifyComponentSnapshot} from './cloud-snapshot-archive.mjs';
const valid=p=>p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===4&&['es','en'].includes(p.language)&&['light','dark','system'].includes(p.theme)&&['neutral','blue','green','violet','rose'].includes(p.colorTheme)&&['vega','nova','maia','lyra','mira'].includes(p.visualStyle);
async function request(server,token,fetchImpl,body){
 const response=await fetchImpl(`${server}/api/runner/preferences-snapshot`,{method:body?'PUT':'GET',headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(response.status===409?'Las preferencias del destino cambiaron; consulta su revisión antes de reintentar.':`No se pudieron transferir las preferencias (HTTP ${response.status}).`);
 return response.json();
}
export async function readAccountPreferences({server,token,fetchImpl=fetch}){const value=await request(server,token,fetchImpl);if(!valid(value.preferences)||!Number.isSafeInteger(value.revision)||value.revision<0)throw new Error('Respuesta de preferencias inválida.');return value;}
export async function captureAccountPreferences({server,token,directory,fetchImpl=fetch}){
 const original=await readAccountPreferences({server,token,fetchImpl});
 return createComponentSnapshot(directory,{metadata:{kind:'account-preferences',preferences:original.preferences},included:['account-preferences'],omitted:['other-account-data','credentials'],objects:[],beforeCommit:async()=>{const current=await readAccountPreferences({server,token,fetchImpl});if(current.revision!==original.revision)throw new Error('Las preferencias cambiaron durante la captura.');}});
}
export async function restoreAccountPreferences({server,token,directory,expectedRevision,fetchImpl=fetch}){
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||expectedRevision>=Number.MAX_SAFE_INTEGER)throw new Error('Indica la revisión actual del destino.');
 const manifest=await verifyComponentSnapshot(directory);if(manifest.included.length!==1||manifest.included[0]!=='account-preferences'||manifest.objects.length)throw new Error('Captura de preferencias inválida.');
 const data=JSON.parse(await readFile(join(directory,'metadata.json'),'utf8'));if(data.kind!=='account-preferences'||!valid(data.preferences))throw new Error('Captura de preferencias inválida.');
 return request(server,token,fetchImpl,{expectedRevision,preferences:data.preferences});
}
