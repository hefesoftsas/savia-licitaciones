import {lstat,readFile} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {accountComponentNames} from './account-components-capture.mjs';
import {verifyComponentSnapshot} from './cloud-snapshot-archive.mjs';
import {readAccountPreferences,restoreAccountPreferences} from './account-preferences-snapshot.mjs';
import {restoreAccountCompanyProfile} from './account-company-profile-snapshot.mjs';
import {restoreAccountImageLibrary} from './account-image-library-snapshot.mjs';
import {restoreAccountRup} from './account-rup-snapshot.mjs';
import {restoreAccountCertificates} from './account-certificates-snapshot.mjs';
import {restoreAccountExportFormat} from './account-export-format-snapshot.mjs';
import {restoreAccountKnowledge} from './account-knowledge-restore.mjs';
import {restoreAccountPaa} from './account-paa-snapshot.mjs';
import {restoreAccountExperience} from './account-experience-snapshot.mjs';
import {restoreAccountFeasibility} from './account-feasibility-restore.mjs';

const defaultRestores=Object.freeze({preferences:restoreAccountPreferences,'company-profile':restoreAccountCompanyProfile,'image-library':restoreAccountImageLibrary,rup:restoreAccountRup,certificates:restoreAccountCertificates,'export-format':restoreAccountExportFormat,knowledge:restoreAccountKnowledge,paa:restoreAccountPaa,experience:restoreAccountExperience,feasibility:restoreAccountFeasibility});
const invalid=()=>new Error('Índice de captura de cuenta inválido.');
export async function restoreAccountComponents({server,token,directory,expectedRevision,fetchImpl=fetch,restores=defaultRestores,readPreferences=readAccountPreferences,onProgress=()=>{}}){
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||expectedRevision>=Number.MAX_SAFE_INTEGER)throw new Error('Indica la revisión actual de las preferencias del destino.');
 if(!isAbsolute(directory))throw invalid();
 let index;try{const root=await lstat(directory),file=await lstat(join(directory,'index.json'));if(!root.isDirectory()||!file.isFile()||file.size>100000)throw invalid();index=JSON.parse(await readFile(join(directory,'index.json'),'utf8'));}catch{throw invalid();}
 if(!index||index.format!=='savia-account-component-collection'||index.version!==1||index.complete!==false||index.atomic!==false||JSON.stringify(index.components)!==JSON.stringify(accountComponentNames)||JSON.stringify(index.omitted)!==JSON.stringify(['projects','credentials','other-account-data']))throw invalid();
 for(const name of accountComponentNames){const manifest=await verifyComponentSnapshot(join(directory,name));const expected=name==='feasibility'?'account-feasibility-components':`account-${name}`;if(manifest.included.length!==1||manifest.included[0]!==expected)throw new Error(`Tipo de captura inválido: ${name}.`);}
 if((await readPreferences({server,token,fetchImpl})).revision!==expectedRevision)throw new Error('Las preferencias del destino cambiaron; consulta su revisión antes de reintentar.');
 const results={};for(const name of [...accountComponentNames.filter(item=>item!=='preferences'),'preferences']){
  try{results[name]=await restores[name]({server,token,fetchImpl,directory:join(directory,name),...(name==='preferences'?{expectedRevision}:{})});}catch(error){throw new Error(`No se pudo recuperar ${name}: ${error.message}`);}
  onProgress(name,results[name]);
 }
 return {complete:false,components:results,omitted:index.omitted};
}
