// Ephemeral UI cache only. D1 remains authoritative across page reloads.
export function createCategoryCache({now=Date.now,ttl=5*60*1000}={}) {
  const entries=new Map(),pending=new Map();
  const keyFor=(dataset,category)=>`${dataset}:${category}`;
  function peek(dataset,category) {
    const key=keyFor(dataset,category),entry=entries.get(key);
    if(entry && entry.expiresAt>now())return entry.data;
    entries.delete(key);
    return null;
  }
  function load(dataset,category,send) {
    const key=keyFor(dataset,category),data=peek(dataset,category);
    if(data!==null)return Promise.resolve(data);
    if(pending.has(key))return pending.get(key);
    const promise=Promise.resolve().then(()=>send(`/api/secop/categories?dataset=${encodeURIComponent(dataset)}&category=${encodeURIComponent(category)}`)).then(result=>{
      if(!result.success || !Array.isArray(result.data))throw new Error(result.message||'');
      entries.set(key,{data:result.data,expiresAt:now()+ttl});
      return result.data;
    }).finally(()=>pending.delete(key));
    pending.set(key,promise);
    return promise;
  }
  return {peek,load};
}
export const categoryCache=createCategoryCache();
