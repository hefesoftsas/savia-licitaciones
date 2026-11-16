export async function uploadSubmissionAttachment({projectId,requestId,file,key,send}){
 if(!file||!Number.isSafeInteger(file.size)||file.size<0||file.size>256*1024*1024)throw new Error('file_too_large');
 return send(`/api/projects/${encodeURIComponent(projectId)}/submission-tracking/requests/${encodeURIComponent(requestId)}/files`,{method:'POST',headers:{'idempotency-key':key,'x-file-name':encodeURIComponent(file.name),'x-savia-size':String(file.size),'content-type':file.type||'application/octet-stream'},body:file});
}
