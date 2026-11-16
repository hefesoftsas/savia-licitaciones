import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createComponentSnapshot,verifyComponentSnapshot} from './cloud-snapshot-archive.mjs';
const {PDFDocument}=createRequire(new URL('../client/package.json',import.meta.url))('pdf-lib');
const sha=data=>createHash('sha256').update(data).digest('hex');
const invalid=()=>{throw new Error('Captura del RUP inválida.');};
const text=(value,max)=>typeof value==='string'&&!!value.trim()&&value.length<=max;
function validate(c){
 if(c===null)return;
 if(!c||!text(c.id,255)||c.id==='.'||c.id==='..'||/[\\/:\x00-\x1f\x7f]/.test(c.id)||!text(c.name,255)||!/\.pdf$/i.test(c.name)||!text(c.importedAt,100)||typeof c.issuedOn!=='string'||(c.issuedOn&&(!/^\d{4}-\d{2}-\d{2}$/.test(c.issuedOn)||Number.isNaN(Date.parse(`${c.issuedOn}T00:00:00Z`))||new Date(`${c.issuedOn}T00:00:00Z`).toISOString().slice(0,10)!==c.issuedOn))||!Number.isSafeInteger(c.pages)||c.pages<1||!Number.isSafeInteger(c.size)||c.size<1||c.size>25*1024*1024||typeof c.etag!=='string'||!c.etag||!Array.isArray(c.facts)||c.facts.length>500)invalid();
 const ids=new Set();for(const f of c.facts){if(!f||!text(f.id,256)||ids.has(f.id)||!text(f.label,300)||!text(f.value,300)||!Number.isSafeInteger(f.page)||f.page<1||f.page>c.pages)invalid();ids.add(f.id);}
}
async function validatePdf(bytes,c){if(bytes.length!==c.size||bytes.subarray(0,5).toString()!=='%PDF-')invalid();let pages;try{pages=(await PDFDocument.load(bytes)).getPageCount();}catch{invalid();}if(pages!==c.pages)invalid();}
export async function captureAccountRup({server,token,directory,fetchImpl=fetch}){
 const base=`${server}/api/runner/rup-capture`,get=async url=>{const response=await fetchImpl(url,{headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(300000)});if(!response.ok)throw new Error(`No se pudo capturar el RUP (HTTP ${response.status}).`);return response;};
 const capture=await(await get(base)).json();if(!/^[a-f0-9]{64}$/.test(capture.revision||''))invalid();validate(capture.certificate);let bytes;
 if(capture.certificate){const c=capture.certificate,response=await get(`${base}/pdf?etag=${encodeURIComponent(c.etag)}&version=${capture.revision}`);bytes=Buffer.from(await response.arrayBuffer());await validatePdf(bytes,c);}
 return createComponentSnapshot(directory,{metadata:{kind:'account-rup',certificate:capture.certificate},included:['account-rup'],omitted:['other-account-data','credentials'],objects:bytes?[{id:'rup-pdf',size:bytes.length,sha256:sha(bytes),open:async()=>Readable.from(bytes)}]:[],beforeCommit:async()=>{const current=await(await get(base)).json();if(current.revision!==capture.revision)throw new Error('El RUP cambió durante la captura.');}});
}
export async function restoreAccountRup({server,token,directory,fetchImpl=fetch}){
 const manifest=await verifyComponentSnapshot(directory);if(manifest.included.length!==1||manifest.included[0]!=='account-rup')invalid();let data;try{data=JSON.parse(await readFile(join(directory,'metadata.json'),'utf8'));}catch{invalid();}if(data?.kind!=='account-rup')invalid();const c=data.certificate;validate(c);
 if(c===null){if(manifest.objects.length)invalid();return {imported:false,current:false,factCount:0,omitted:manifest.omitted};}
 if(manifest.objects.length!==1||manifest.objects[0].id!=='rup-pdf'||manifest.objects[0].size!==c.size)invalid();const bytes=await readFile(join(directory,'objects',manifest.objects[0].file));if(sha(bytes)!==manifest.objects[0].sha256)invalid();await validatePdf(bytes,c);
 const requestId=`snapshot-rup-${sha(JSON.stringify({metadataSha256:manifest.metadataSha256,objects:manifest.objects}))}`,form=new FormData();form.set('metadata',JSON.stringify({sourceId:c.id,name:c.name,importedAt:c.importedAt,issuedOn:c.issuedOn,facts:c.facts}));form.set('pdf',new Blob([bytes],{type:'application/pdf'}),c.name);
 const response=await fetchImpl(`${server}/api/runner/imports/rup/${requestId}`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:form,redirect:'error',signal:AbortSignal.timeout(300000)});if(!response.ok)throw new Error(`No se pudo recuperar el RUP (HTTP ${response.status}). Un certificado existente no se reemplaza.`);const result=await response.json();return {imported:result.imported,current:result.current,factCount:c.facts.length,omitted:manifest.omitted};
}
