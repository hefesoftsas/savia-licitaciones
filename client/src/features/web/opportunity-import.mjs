export const MAX_OPPORTUNITY_DOCUMENTS = 100;
const supported = new Set(['pdf','doc','docx','xls','xlsx','zip']);
export function selectableDocument(doc) {
  return /^[A-Za-z0-9._-]+$/.test(doc.id) && supported.has(doc.extension) && (doc.size == null || doc.size <= 50*1024*1024);
}
export function selectLoadedDocuments(documents) {
  return [...new Set(documents.filter(selectableDocument).map(doc=>doc.id))].slice(0,MAX_OPPORTUNITY_DOCUMENTS);
}
export async function prepareOpportunity(request,process,ids) {
  const documentIds=[...new Set(ids)];
  const {project} = await request('/api/projects/from-secop',{method:'POST',json:{process,documentIds}});
  const imported=[],queued=[],failed=[];
  for (const id of documentIds) {
    try {
      const result=await request(`/api/projects/${encodeURIComponent(project.id)}/secop/imports/${encodeURIComponent(id)}`,{method:'POST'});
      (result.job || result.state === 'queued' ? queued : imported).push(id);
    } catch { failed.push(id); }
  }
  return {project,imported,queued,failed};
}
