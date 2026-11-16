export async function restoreSnapshot({manifest,verifyDatabase,targetsEmpty,listObjects,copyObject,restoreDatabase,checkForeignKeys}){
 const hash=/^[a-f0-9]{64}$/;
 if(manifest?.version!==1||typeof manifest.prefix!=='string'||!manifest.prefix.startsWith('snapshots/')||!manifest.prefix.endsWith('/objects/')||!hash.test(manifest.database?.restoreSha256||'')||!Array.isArray(manifest.objects)||manifest.count!==manifest.objects.length)throw Error('Manifiesto no válido.');
 const expected=new Map();
 for(const item of manifest.objects){if(typeof item.key!=='string'||!item.key||!Number.isSafeInteger(item.size)||item.size<0||!hash.test(item.sha256||'')||expected.has(item.key))throw Error('Objeto inválido en el manifiesto.');expected.set(item.key,item);}
 if(!await verifyDatabase(manifest.database.restoreSha256))throw Error('La exportación D1 no coincide con el manifiesto.');
 if(!await targetsEmpty())throw Error('La restauración requiere destinos nuevos y vacíos.');
 const objects=await listObjects();if(objects.length!==expected.size)throw Error('El número de objetos no coincide.');
 const keys=new Set();
 for(const item of objects){
  if(typeof item.key!=='string'||!item.key.startsWith(manifest.prefix))throw Error('Objeto fuera del respaldo.');
  const key=item.key.slice(manifest.prefix.length),entry=expected.get(key);
  if(!entry||keys.has(key)||entry.size!==item.size)throw Error('Los objetos no coinciden con el manifiesto.');keys.add(key);
 }
 for(const item of objects){const result=await copyObject(item),entry=expected.get(item.key.slice(manifest.prefix.length));if(result.size!==entry.size||result.sha256!==entry.sha256)throw Error('La copia de un objeto no coincide con su huella.');}
 await restoreDatabase();
 if(!await checkForeignKeys())throw Error('La base restaurada contiene referencias inválidas.');
 return {count:objects.length};
}
