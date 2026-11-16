'use strict';

// Export only recorded decisions and evidence; no eligibility inference is made.
function matrixRows({process,exportedAt,rows},language='es') {
 const en=language==='en';
 const categories=en?{general:'General',legal:'Legal',financial:'Financial',technical:'Technical',experience:'Experience'}:{general:'General',legal:'Jurídico',financial:'Financiero',technical:'Técnico',experience:'Experiencia'};
 const statuses=en?{pending:'Pending',meets:'Meets',does_not_meet:'Does not meet',unknown:'Undetermined'}:{pending:'Pendiente',meets:'Cumple',does_not_meet:'No cumple',unknown:'No determinado'};
 const output=[[en?'Tender ID':'ID de licitación',process.id],[en?'Reference':'Referencia',process.reference],[en?'Entity':'Entidad',process.entity],[en?'Tender':'Licitación',process.title],[en?'Exported at (UTC)':'Exportado (UTC)',exportedAt],[],
  en?['Requirement ID','Requirement','Category','Human review','Tender source','Evidence','Updated','RUP certificate','RUP page','RUP fact','Recorded value','User interpretation','Rule','Threshold','Comparison status']:['ID de requisito','Requisito','Categoría','Valoración humana','Fuente del pliego','Soporte','Actualizado','Certificado RUP','Página RUP','Dato RUP','Valor registrado','Interpretación del usuario','Regla','Umbral','Estado de comparación']];
 for(const {requirement:r,comparison:c} of rows){
  output.push([r.id,r.title,categories[r.category]||r.category,statuses[r.status]||r.status,r.source,r.evidence,r.updatedAt,c?.certificateName,c?.page,c?.label,c?.value,c?.interpretedValue,c?(c.operator==='gte'?'≥':'≤'):'',c?.threshold,c?(c.stale?(en?'Outdated':'Desactualizada'):(en?'Current':'Vigente')):'']);
 }
 output.push([],[en?'Snapshot of saved reviews. Verify sources and current tender conditions. Changes in this file do not update Savia.':'Copia de las valoraciones guardadas. Verifica las fuentes y condiciones actuales. Los cambios en este archivo no actualizan Savia.']);
 return output.map(row=>row.map(value=>String(value??'')));
}
function formatRequirementMatrixCsv(input,language='es') {
 const safe=value=>/^[\s\u0000-\u001f]*[=+\-@\t\r]/.test(value)?`'${value}`:value;
 return `\ufeff${matrixRows(input,language).map(row=>row.map(value=>`"${safe(value).replace(/"/g,'""')}"`).join(',')).join('\r\n')}\r\n`;
}
function formatRequirementMatrixXlsx(input,language='es') {
 const XLSX=require('xlsx'),sheet=XLSX.utils.aoa_to_sheet(matrixRows(input,language));
 sheet['!cols']=[{wch:22},{wch:48},{wch:16},{wch:20},{wch:42},{wch:42},{wch:24},{wch:28},{wch:13},{wch:30},{wch:20},{wch:24},{wch:12},{wch:16},{wch:22}];
 if(input.rows.length)sheet['!autofilter']={ref:`A7:O${7+input.rows.length}`};
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,language==='en'?'Requirements':'Requisitos');
 return XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true});
}
module.exports={formatRequirementMatrixCsv,formatRequirementMatrixXlsx};
