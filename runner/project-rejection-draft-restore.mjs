const keys=['rejectionCheck','typoCheck','logicCheck'];
export function validProjectRejectionDraft(value){
 if(value===null)return true;
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===4&&typeof value.criteria==='string'&&value.criteria.length<=200000&&typeof value.custom==='string'&&value.custom.length<=20000&&typeof value.updatedAt==='string'&&value.updatedAt.length>0&&value.updatedAt.length<=100&&!!value.options&&typeof value.options==='object'&&!Array.isArray(value.options)&&Object.keys(value.options).length===keys.length&&keys.every(key=>typeof value.options[key]==='boolean');
}
export async function restoreProjectRejectionDraft({draft,server,requestId,send}){
 if(!validProjectRejectionDraft(draft))throw new Error('El borrador de rechazo de la captura no es válido.');
 if(draft!==null)await send(`${server}/api/runner/imports/technical-plan/${requestId}/rejection-draft`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(draft)});
}
