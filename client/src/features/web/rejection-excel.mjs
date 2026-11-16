import * as XLSX from 'xlsx';

function cell(value,en){
 if(value===null||value===undefined)return '';
 if(typeof value==='number')return Number.isFinite(value)?value:0;
 const text=String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,''),suffix=en?'… (truncated)':'… (texto truncado)';
 return text.length<=32767?text:text.slice(0,32767-suffix.length)+suffix;
}

export function buildRejectionExcel(report,{language='es',files=[],bidFileIds=[]}={}){
 const en=language==='en',L=(es,english)=>en?english:es,names=new Map([...(report.sourceFiles||[]),...files].map(file=>[file.id,file.name])),name=id=>names.get(id)||id||'',number=id=>{const index=bidFileIds.indexOf(id);return index<0?'':index+1;};
 const sections=[report.rejectionCheckResult,report.typoCheckResult,report.logicCheckResult],status=value=>({success:L('Completado','Complete'),error:L('Falló','Failed'),running:L('En ejecución','Running'),idle:L('Sin iniciar','Not started')})[value]||L('Sin iniciar','Not started');
 const workbook=XLSX.utils.book_new(),add=(title,rows,widths)=>{const sheet=XLSX.utils.aoa_to_sheet(rows.map(row=>row.map(value=>cell(value,en))));sheet['!cols']=widths.map(wch=>({wch}));XLSX.utils.book_append_sheet(workbook,sheet,title);};
 add(L('Resumen de revisión','Review summary'),[[L('Tipo de revisión','Review type'),L('Estado','Status'),L('Hallazgos','Findings'),L('Retirados','Removed'),L('Actualizado','Updated'),L('Ofertas','Bids')],...[L('Causales de rechazo','Rejection risks'),L('Ortografía','Spelling'),L('Lógica','Logic')].map((label,index)=>[label,status(sections[index]?.status),sections[index]?.findings?.length||0,sections[index]?.removedCount||0,sections[index]?.updatedAt||'',bidFileIds.map(name).join('; ')])],[28,18,14,14,24,45]);
 add(L('Causales de rechazo','Rejection risks'),[[L('N.º','No.'),L('N.º de oferta','Bid no.'),L('Oferta','Bid'),L('Tipo','Type'),L('Gravedad','Severity'),L('Título','Title'),L('Resumen','Summary'),L('Requisito','Requirement'),L('Evidencia','Evidence'),L('Motivo','Reason'),L('Sugerencia','Suggestion')],...(sections[0]?.findings||[]).map((item,index)=>[index+1,number(item.bidDocumentId),name(item.bidDocumentId),item.type==='invalidBid'?L('Oferta no válida','Invalid bid'):L('Causal de rechazo','Rejection risk'),({high:L('Alta','High'),medium:L('Media','Medium'),low:L('Baja','Low')})[item.severity]||item.severity||'',item.title,item.summary,item.requirement,item.bidEvidence,item.riskReason,item.suggestion])],[8,14,30,23,14,28,42,42,42,42,42]);
 add(L('Errores ortográficos','Spelling'),[[L('N.º','No.'),L('N.º de oferta','Bid no.'),L('Oferta','Bid'),L('Texto incorrecto','Incorrect text'),L('Corrección sugerida','Suggested correction'),L('Ubicación','Location'),L('Fragmento original','Original excerpt'),L('Motivo','Reason')],...(sections[1]?.findings||[]).map((item,index)=>[index+1,number(item.bidDocumentId),name(item.bidDocumentId),item.wrongText,item.correctText,item.locationHint,item.originalExcerpt,item.reason])],[8,14,30,24,24,30,55,45]);
 add(L('Problemas de lógica','Logic'),[[L('N.º','No.'),L('N.º de oferta','Bid no.'),L('Oferta','Bid'),L('Título','Title'),L('Ubicación','Location'),L('Texto original','Original text'),L('Motivo','Reason'),L('Sugerencia','Suggestion')],...(sections[2]?.findings||[]).map((item,index)=>[index+1,number(item.bidDocumentId),name(item.bidDocumentId),item.title,item.locationHint,item.originalText,item.fallacyReason,item.suggestion])],[8,14,30,28,30,55,45,45]);
 return XLSX.write(workbook,{bookType:'xlsx',type:'array',compression:true});
}
