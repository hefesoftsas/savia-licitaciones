import {link,mkdir,unlink,writeFile} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {captureAccountPreferences} from './account-preferences-snapshot.mjs';
import {captureAccountCompanyProfile} from './account-company-profile-snapshot.mjs';
import {captureAccountImageLibrary} from './account-image-library-snapshot.mjs';
import {captureAccountRup} from './account-rup-snapshot.mjs';
import {captureAccountCertificates} from './account-certificates-snapshot.mjs';
import {captureAccountExportFormat} from './account-export-format-snapshot.mjs';
import {captureAccountKnowledge} from './account-knowledge-capture.mjs';
import {captureAccountPaa} from './account-paa-snapshot.mjs';
import {captureAccountExperience} from './account-experience-snapshot.mjs';
import {captureAccountFeasibility} from './account-feasibility-capture.mjs';

const defaultCaptures=Object.freeze({preferences:captureAccountPreferences,'company-profile':captureAccountCompanyProfile,'image-library':captureAccountImageLibrary,rup:captureAccountRup,certificates:captureAccountCertificates,'export-format':captureAccountExportFormat,knowledge:captureAccountKnowledge,paa:captureAccountPaa,experience:captureAccountExperience,feasibility:captureAccountFeasibility});
export const accountComponentNames=Object.freeze(Object.keys(defaultCaptures));

export async function captureAccountComponents({server,token,destination,fetchImpl=fetch,captures=defaultCaptures,onProgress=()=>{}}){
 if(!isAbsolute(destination))throw new Error('Indica una ruta absoluta nueva para la captura.');
 try{await mkdir(destination,{mode:0o700});}catch(error){if(error.code==='EEXIST')throw new Error('La carpeta de captura ya existe; elige otra.');throw error;}
 for(const name of accountComponentNames){
  try{await captures[name]({server,token,fetchImpl,directory:join(destination,name)});}catch(error){throw new Error(`No se pudo capturar ${name}: ${error.message}`);}
  onProgress(name);
 }
 const index={format:'savia-account-component-collection',version:1,complete:false,components:[...accountComponentNames],omitted:['projects','credentials','other-account-data'],atomic:false};
 const temporary=join(destination,'index.json.tmp');await writeFile(temporary,JSON.stringify(index),{encoding:'utf8',mode:0o600,flag:'wx'});try{await link(temporary,join(destination,'index.json'));}finally{await unlink(temporary);}
 return index;
}
