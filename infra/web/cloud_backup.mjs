// Cross-store capture coordinator. The caller must restrict every other
// D1/R2 writer and provide a gate that tracks all application requests.
export async function captureSnapshot({gate,exportDatabase,copyObjects,saveManifest,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=60,intervalMs=1000}){
 let locked=false;
 const assertDrained=async()=>{const s=await gate.status();if(!s.locked||!s.owned||s.active!==0)throw Error('La barrera de respaldo dejó de estar bloqueada y drenada.');};
 try{
  await gate.lock();locked=true;
  let drained=false;
  for(let i=0;i<attempts;i++){
   const s=await gate.status();if(!s.locked||!s.owned)throw Error('Se perdió el bloqueo de respaldo.');
   if(s.active===0){drained=true;break;}await wait(intervalMs);
  }
  if(!drained)throw Error('Hay operaciones activas; no se generó un respaldo.');
  const database=await exportDatabase();await assertDrained();
  const objects=await copyObjects();await assertDrained();
  const manifest={database,...objects};await saveManifest(manifest);return manifest;
 }finally{if(locked)await gate.unlock();}
}
