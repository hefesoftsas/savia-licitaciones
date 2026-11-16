import {extractDesktopAssets} from './desktop-assets.mjs';
const tables=['rejection_check_meta','rejection_check_documents','rejection_check_tasks','rejection_check_extraction','rejection_check_results','rejection_check_risk_findings','rejection_check_typo_findings','rejection_check_logic_findings'];

export function readDesktopRejectionCheck(db,files,hasTable){
 const rows=Object.fromEntries(tables.map(table=>[table,hasTable(table)?db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all():[]]));
 const documents=rows.rejection_check_documents.map(row=>{
  const path=typeof row.markdown_path==='string'?row.markdown_path.replace(/\\/g,'/'):'',parts=path.split('/');
  const safe=parts[0]==='rejection-check'&&parts.length>=2&&parts.every(part=>part&&part!=='.'&&part!=='..'&&!/[:\x00-\x1f\x7f]/.test(part));
  const bytes=safe?files.get(`workspace/${parts.join('/')}`):null;
  const detail=!safe?{missing:true,reason:'unsafe_path'}:!bytes?{missing:true,reason:'not_found'}:!bytes.length?{missing:true,reason:'empty'}:bytes.length>25*1024*1024?{missing:true,reason:'too_large'}:{bytes};
  return {id:row.document_id,...detail};
 });
 const {assets,missingAssets}=extractDesktopAssets(documents.filter(item=>item.bytes).map(item=>({content:item.bytes.toString('utf8')})),files);
 for(const row of rows.rejection_check_documents)delete row.markdown_path;
 return {present:tables.some(table=>rows[table].length>0),tables:rows,documents,assets,missingAssets};
}
