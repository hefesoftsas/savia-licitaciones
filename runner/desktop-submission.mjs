import {createHash} from 'node:crypto';

// Reads the desktop tables without making missing files look like valid evidence.
export function readDesktopSubmission(db,files,hasTable,processId){
 const empty=()=>({requests:[],results:[],submissions:[],attachments:[],evidence:[],missing:[]});
 const tables=['secop_submission_requests','secop_submission_results','secop_submission_records','secop_submission_files'];
 if(!processId||tables.every(name=>!hasTable(name)))return empty();
 if(tables.some(name=>!hasTable(name)))throw new Error('El seguimiento de escritorio está incompleto.');
 const output=empty();
 output.requests=db.prepare('SELECT * FROM secop_submission_requests WHERE process_id=? ORDER BY created_at,id').all(processId).map(row=>({id:row.id,kind:row.kind,title:row.title,dueDate:row.due_date,note:row.note,status:row.status,taskId:row.task_id,version:1,createdAt:row.created_at,updatedAt:row.updated_at}));
 output.results=db.prepare('SELECT * FROM secop_submission_results WHERE process_id=? ORDER BY created_at,id').all(processId).map(row=>({id:row.id,result:row.result,note:row.note,createdAt:row.created_at}));
 const rows=db.prepare('SELECT * FROM secop_submission_files WHERE process_id=? ORDER BY created_at,id').all(processId),byId=new Map(rows.map(row=>[row.id,row])),used=new Set();
 const readFile=(row,owner,role)=>{
  if(!row||row.owner_id!==owner||row.role!==role){output.missing.push({id:row?.id||'',ownerId:owner,role,reason:'record_missing'});return null;}
  used.add(row.id);const stored=row.stored_name,safe=typeof stored==='string'&&stored.length>0&&stored.length<=255&&stored!=='.'&&stored!=='..'&&!/[\\/:\x00-\x1f\x7f]/.test(stored),bytes=safe?files.get(`workspace/submission-evidence/${stored}`):undefined;
  let reason=!safe?'unsafe_path':!bytes?'not_found':!Number.isSafeInteger(row.size)||row.size<0||row.size>256*1024*1024||bytes.length!==row.size?'size_mismatch':!/^[a-f0-9]{64}$/.test(row.sha256||'')||createHash('sha256').update(bytes).digest('hex')!==row.sha256?'hash_mismatch':null;
  if(reason){output.missing.push({id:row.id,ownerId:owner,role,name:row.name,reason});return null;}
  return {id:row.id,name:row.name,contentType:'application/octet-stream',size:row.size,sha256:row.sha256,createdAt:row.created_at,bytes};
 };
 for(const request of output.requests)for(const row of rows.filter(item=>item.owner_id===request.id&&item.role==='request')){const file=readFile(row,request.id,'request');if(file)output.attachments.push({...file,requestId:request.id});}
 for(const row of db.prepare('SELECT * FROM secop_submission_records WHERE process_id=? ORDER BY created_at,id').all(processId)){
  output.submissions.push({id:row.id,date:row.date,reference:row.reference,version:row.version,note:row.note,createdAt:row.created_at});
  for(const [role,fileId] of [['package',row.package_id],['receipt',row.receipt_id]]){const file=readFile(byId.get(fileId),row.id,role);if(file)output.evidence.push({...file,submissionId:row.id,role});}
 }
 for(const row of rows)if(!used.has(row.id))output.missing.push({id:row.id,ownerId:row.owner_id,role:row.role,name:row.name,reason:'orphan_record'});
 return output;
}
