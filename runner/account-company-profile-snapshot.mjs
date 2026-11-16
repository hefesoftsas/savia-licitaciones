import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createComponentSnapshot,verifyComponentSnapshot} from './cloud-snapshot-archive.mjs';
import {prepareAccountCompanyProfileCapture} from './account-company-profile-capture.mjs';
const fields=['companyName','unifiedSocialCreditCode','phone','email','legalRepresentative','registeredCapital','operatingPeriodStart','operatingPeriodEnd','address','businessScope','industry','companyType','insuredEmployeeCount','companyIntro','taxCertificateDate','taxCertificateNote','auditReportDate','auditReportNote','socialSecurityCertificateDate','socialSecurityCertificateNote','bankAccountName','bankAccountNumber','bankName','bankRoutingNumber','watermarkContent'];
const categories=['officeEnvironment','businessLicense','legalRepresentativeIdEmblem','legalRepresentativeIdPortrait','legalRepresentativeAuthorization','authorizedRepresentativeIdEmblem','authorizedRepresentativeIdPortrait','basicDepositAccountInfo','creditChinaReport','governmentProcurementRecord','enterpriseCreditReport','dishonestEnforcementQuery','taxCertificate','auditReport','socialSecurityCertificate','bankAccountLicense'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const invalid=()=>{throw new Error('Captura del perfil de empresa inválida.');};
function imageType(b){const starts=a=>a.every((v,i)=>b[i]===v);if(starts([137,80,78,71,13,10,26,10]))return 'image/png';if(starts([255,216,255]))return 'image/jpeg';if(starts([71,73,70,56])&&(b[4]===55||b[4]===57)&&b[5]===97)return 'image/gif';if(starts([66,77]))return 'image/bmp';if(starts([82,73,70,70])&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80)return 'image/webp';return '';}
function validProfile(value){if(value===null)return true;const p=value?.profile;return !!(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===fields.length+1&&fields.every(f=>typeof p[f]==='string'&&p[f].length<=100000)&&typeof p.watermarkEnabled==='boolean'&&JSON.stringify(p).length<=512000&&typeof value.updatedAt==='string'&&value.updatedAt.length>0&&value.updatedAt.length<=100);}
export async function captureAccountCompanyProfile({server,token,directory,fetchImpl=fetch}){
 const capture=await prepareAccountCompanyProfileCapture({server,token,fetchImpl});
 return createComponentSnapshot(directory,{metadata:{kind:'account-company-profile',profile:capture.profile,images:capture.images},included:['account-company-profile'],omitted:['other-account-data','credentials'],objects:capture.objects,beforeCommit:capture.assertUnchanged});
}
export async function restoreAccountCompanyProfile({server,token,directory,fetchImpl=fetch}){
 const manifest=await verifyComponentSnapshot(directory);if(manifest.included.length!==1||manifest.included[0]!=='account-company-profile')invalid();
 let data;try{data=JSON.parse(await readFile(join(directory,'metadata.json'),'utf8'));}catch{invalid();}
 if(data?.kind!=='account-company-profile'||!validProfile(data.profile)||!Array.isArray(data.images)||data.images.length!==manifest.objects.length)invalid();
 const objects=new Map(manifest.objects.map(x=>[x.id,x])),seen=new Set(),items=[];
 for(const image of data.images){if(!image||typeof image.id!=='string'||!/^[A-Za-z0-9._:-]{1,106}$/.test(image.id)||seen.has(image.id)||typeof image.name!=='string'||!image.name.trim()||image.name.length>255||/[\x00-\x1f\x7f]/.test(image.name)||typeof image.customName!=='string'||image.customName.length>20000||!categories.includes(image.fieldKey)||!Number.isSafeInteger(image.sortOrder)||image.sortOrder<0||image.sortOrder>1000000||typeof image.createdAt!=='string'||!image.createdAt||image.createdAt.length>100)invalid();
  seen.add(image.id);const entry=objects.get(`company-profile-image:${image.id}`);if(!entry||entry.size<1||entry.size>25*1024*1024||entry.size!==image.size)invalid();const bytes=await readFile(join(directory,'objects',entry.file));if(bytes.length!==entry.size||sha(bytes)!==entry.sha256||imageType(bytes)!==image.contentType)invalid();items.push({image,entry});
 }
 const requestId=sha(JSON.stringify({metadataSha256:manifest.metadataSha256,objects:manifest.objects}));const base=`${server}/api/runner/imports/company-profile-snapshots/${requestId}`;
 const send=async(url,body,json=false)=>fetchImpl(url,{method:'POST',headers:{authorization:`Bearer ${token}`,...(json?{'content-type':'application/json'}:{})},body:json?JSON.stringify(body):body,redirect:'error',signal:AbortSignal.timeout(300000)});
 const response=await send(base,{profile:data.profile},true);if(!response.ok)throw new Error(`No se pudo recuperar el perfil (HTTP ${response.status}).`);
 let images=0,removed=0;for(const {image,entry} of items){const bytes=await readFile(join(directory,'objects',entry.file));if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)invalid();const form=new FormData();form.set('metadata',JSON.stringify({sourceId:image.id,name:image.name,customName:image.customName,fieldKey:image.fieldKey,sortOrder:image.sortOrder,createdAt:image.createdAt}));form.set('file',new Blob([bytes],{type:image.contentType}),image.name);const result=await send(`${base}/images/${sha(image.id)}`,form);if(result.status===410){removed++;continue;}if(!result.ok)throw new Error(`No se pudo recuperar una imagen (HTTP ${result.status}). Repite el comando para continuar.`);images++;}
 return {images,removed,omitted:manifest.omitted};
}
