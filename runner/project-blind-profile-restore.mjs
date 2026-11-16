import presets from '../client/electron/services/blindCheckPresets.cjs';
export function validateProjectBlindProfile(value){
 if(value===null)return;
 if(!value||typeof value.updatedAt!=='string'||!value.updatedAt||value.updatedAt.length>100||!value.profile||typeof value.profile!=='object'||Array.isArray(value.profile))throw new Error('El perfil anónimo de la captura no es válido.');
 const json=JSON.stringify(value.profile);let normalized;try{normalized=JSON.stringify(presets.normalizeProfile(value.profile));}catch{throw new Error('El perfil anónimo de la captura no es válido.');}
 if(json.length>100000||json!==normalized)throw new Error('El perfil anónimo de la captura no es válido.');
}
export async function restoreProjectBlindProfile({blindProfile,server,requestId,send}){
 validateProjectBlindProfile(blindProfile);if(blindProfile===null)return;
 await send(`${server}/api/runner/imports/technical-plan/${requestId}/blind-profile`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(blindProfile)});
}
