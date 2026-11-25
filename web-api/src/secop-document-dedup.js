import {createHash} from 'node:crypto';

const maxFileBytes = 50 * 1024 * 1024;

export function secopDocumentHeaders(accept) {
  return {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'accept': accept || 'application/octet-stream, application/pdf, */*;q=0.8',
    'accept-language': 'es-CO,es;q=0.9',
  };
}

export function secopFileUrl(id) {
  const url = new URL('https://community.secop.gov.co/Public/Archive/RetrieveFile/Index');
  url.search = new URLSearchParams({DocumentId:id, InCommunity:'False', InPaymentGateway:'False', DocUniqueIdentifier:''});
  return url;
}

async function fingerprint(item, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  try {
    const response = await fetch(secopFileUrl(item.id), {redirect:'manual', headers:secopDocumentHeaders(), signal:AbortSignal.timeout(Math.min(5000, remaining))});
    const mime = response.headers.get('content-type') || '';
    const length = response.headers.get('content-length');
    if (!response.ok || !response.body || /(?:text\/html|javascript|json)/i.test(mime) || (length && Number(length)!==item.size)) {
      await response.body?.cancel();
      return null;
    }
    const hash = createHash('sha256');
    const reader = response.body.getReader();
    let size = 0;
    try {
      while (true) {
        const {done,value} = await reader.read();
        if (done) return size===item.size ? hash.digest('hex') : null;
        size += value.byteLength;
        if (size>item.size) { await reader.cancel(); return null; }
        hash.update(value);
      }
    } finally {
      reader.releaseLock();
    }
  } catch {
    return null;
  }
}

export async function deduplicateSecopDocuments(items) {
  const groups = new Map();
  for (const item of items) {
    if (!Number.isSafeInteger(item.size) || item.size<=0 || item.size>maxFileBytes) continue;
    const group = groups.get(item.size) || [];
    group.push(item);
    groups.set(item.size,group);
  }
  const candidates = [...groups.values()].filter(group=>group.length>1).flat();
  const fingerprints = new Map();
  const deadline = Date.now() + 20000;
  let next = 0;
  await Promise.all(Array.from({length:Math.min(5,candidates.length)},async()=>{
    while (next<candidates.length && Date.now()<deadline) {
      const item = candidates[next++];
      const hash = await fingerprint(item,deadline);
      if (hash) fingerprints.set(item.id,hash);
    }
  }));
  const seen = new Set();
  return items.filter(item=>{
    const hash = fingerprints.get(item.id);
    if (!hash) return true;
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });
}
