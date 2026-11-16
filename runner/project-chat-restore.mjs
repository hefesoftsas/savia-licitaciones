export function validateProjectChat(messages) {
 if(!Array.isArray(messages) || messages.length>5000)throw new Error('El historial de la captura no es válido.');
 const normalized=[];
 for(const item of messages){
  if(!item || typeof item.id!=='string' || !item.id || item.id.length>256 || typeof item.role!=='string' || item.role.length>100 || typeof item.content!=='string' || item.content.length>1000000 || typeof item.status!=='string' || item.status.length>100 || typeof item.createdAt!=='string' || item.createdAt.length>100 || (item.followupsJson!==null && (typeof item.followupsJson!=='string' || item.followupsJson.length>100000)))throw new Error('El historial de la captura no es válido.');
  normalized.push({id:item.id,role:item.role,content:item.content,status:item.status,createdAt:item.createdAt,followupsJson:item.followupsJson});
 }
 if(JSON.stringify(normalized).length>3000000)throw new Error('El historial de la captura es demasiado grande.');
 return normalized;
}

export async function restoreProjectChat({messages,server,requestId,send}) {
 const normalized=validateProjectChat(messages);
 if(normalized.length)await send(`${server}/api/runner/imports/technical-plan/${requestId}/chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:normalized})});
}
