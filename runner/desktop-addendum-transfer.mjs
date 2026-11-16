export async function transferDesktopAddendum({data,server,token,requestId,send=fetch}) {
  const runs=data?.runs || [];
  if (!runs.length) return {status:'absent',count:0};
  const encoder=new TextEncoder(),body=JSON.stringify({runs});
  if(runs.length>50 || encoder.encode(JSON.stringify(runs)).length>900000 || runs.some(run=>!run || typeof run.id!=='string' || !run.id || run.id.length>200 || !['completed','error','interrupted'].includes(run.status) || run.historical!==true || !Array.isArray(run.reviews) || encoder.encode(JSON.stringify(run)).length>262144)) return {status:'unsupported',count:runs.length};
  const response=await send(`${server}/api/runner/imports/technical-plan/${encodeURIComponent(requestId)}/addenda`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body,redirect:'error',signal:AbortSignal.timeout(60_000)});
  if(!response.ok)throw new Error(`No se pudo transferir el historial de adendas (HTTP ${response.status}). Repite el comando para continuar.`);
  return {status:'imported',count:runs.length};
}
