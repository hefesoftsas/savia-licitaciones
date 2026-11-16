import {createHash} from 'node:crypto';
const safeName=value=>typeof value==='string'&&value.length>0&&value.length<=255&&value!=='.'&&value!=='..'&&!/[\\/:\x00-\x1f\x7f]/.test(value);
const digest=value=>createHash('sha256').update(value).digest('hex');

// Only bytes inside the archive are read; external paths never leave this function.
export function readDesktopOfferDocuments(db,files,hasTable,processId){
 const empty=()=>({documents:[],links:[],presentation:[],orphanLinks:[]}),tables=['secop_offer_documents','secop_offer_support_files','secop_presentation_files'];
 if(!processId||tables.every(name=>!hasTable(name)))return empty();if(tables.some(name=>!hasTable(name)))throw new Error('Los documentos de oferta del respaldo están incompletos.');
 const result=empty(),rows=db.prepare('SELECT * FROM secop_offer_documents WHERE process_id=? ORDER BY created_at,id').all(processId),byId=new Map();
 for(const row of rows){let key=null,reason=null;
  if(row.kind==='managed'){if(safeName(row.ref))key=`workspace/offer-support-files/${row.ref}`;else reason='unsafe_path';}
  else if(row.kind==='external')reason='outside_backup';
  else if(row.kind==='company'&&typeof row.ref==='string'&&row.ref.startsWith('rup:')){
   const reference=row.ref.slice(4),rup=hasTable('rup_certificate')?db.prepare('SELECT stored_name FROM rup_certificate WHERE id=1').get():null;
   if(!safeName(reference))reason='unsafe_path';else if(rup?.stored_name!==reference)reason='company_reference_missing';else key=`workspace/credential-library/rup/${reference}`;
  }else if(row.kind==='company'&&typeof row.ref==='string'&&row.ref.startsWith('credential:')){
   const imageId=row.ref.slice(11),image=hasTable('credential_library_images')?db.prepare('SELECT relative_path FROM credential_library_images WHERE image_id=?').get(imageId):null,parts=typeof image?.relative_path==='string'?image.relative_path.replace(/\\/g,'/').split('/'):[];
   if(!image)reason='company_reference_missing';else if(parts.length!==2||parts[0]!=='images'||!safeName(parts[1]))reason='unsafe_path';else key=`workspace/credential-library/${parts.join('/')}`;
  }else reason='unsupported_reference';
  const bytes=key?files.get(key):undefined;if(key&&!bytes)reason='not_found';if(bytes&&bytes.length>256*1024*1024)reason='too_large';
  const item={id:row.id,kind:row.kind,name:row.name,createdAt:row.created_at,...(reason?{missing:true,reason}:{bytes,size:bytes.length,sha256:digest(bytes)})};result.documents.push(item);byId.set(row.id,item);
 }
 const haveSupports=hasTable('secop_requirement_supports'),support=haveSupports?db.prepare('SELECT 1 FROM secop_requirement_supports WHERE process_id=? AND requirement_id=? AND id=?'):null;
 for(const row of db.prepare('SELECT * FROM secop_offer_support_files WHERE process_id=? ORDER BY requirement_id,support_id,document_id').all(processId)){
  const item={requirementId:row.requirement_id,supportId:row.support_id,documentId:row.document_id};
  if(!byId.has(row.document_id)||(support&&!support.get(processId,row.requirement_id,row.support_id)))result.orphanLinks.push(item);else result.links.push(item);
 }
 const flagged=hasTable('addendum_file_review_flags')?new Set(db.prepare('SELECT DISTINCT document_id FROM addendum_file_review_flags WHERE process_id=?').all(processId).map(row=>row.document_id)):new Set();
 for(const row of db.prepare('SELECT * FROM secop_presentation_files WHERE process_id=? ORDER BY sort_order,id').all(processId)){
  const doc=byId.get(row.document_id),reviewRequired=flagged.has(row.document_id),state=!doc||doc.missing?'missing':!Number.isSafeInteger(row.size)||row.size!==doc.size||!/^[a-f0-9]{64}$/.test(row.digest||'')||row.digest!==doc.sha256?'changed':reviewRequired?'review':'ready';
  result.presentation.push({id:row.id,documentId:row.document_id,sortOrder:row.sort_order,size:row.size,digest:row.digest,state,reviewRequired});
 }
 return result;
}
