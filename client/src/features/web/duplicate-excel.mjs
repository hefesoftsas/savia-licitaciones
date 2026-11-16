import * as XLSX from 'xlsx';

// Excel's cell text limit is 32767 characters; the JSON download remains lossless.
function cell(value,en){
 if(value===null||value===undefined)return '';
 if(typeof value==='number')return Number.isFinite(value)?value:0;
 const text=String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'');
 const suffix=en?'… (truncated)':'… (texto truncado)';
 return text.length<=32767?text:text.slice(0,32767-suffix.length)+suffix;
}

export function buildDuplicateExcel(report,{language='es',files=[],bidFileIds=[],tenderFileIds=[],labelForMetadata}={}){
 const en=language==='en',L=(es,english)=>en?english:es;
 const names=new Map([...(report.sourceFiles||[]),...files].map(file=>[file.id,file.name]));
 const name=id=>names.get(id)||id,join=ids=>(ids||[]).map(name).join('; ');
 const meta=report.metadataAnalysis||{},outline=report.outlineAnalysis||{},content=report.contentAnalysis||{},images=report.imageAnalysis||{};
 const status=value=>({success:L('Completado','Complete'),error:L('Parcial o con errores','Partial or failed'),running:L('En ejecución','Running'),pending:L('Sin iniciar','Not started')})[value]||L('Sin iniciar','Not started');
 const workbook=XLSX.utils.book_new();
 const add=(title,rows,widths)=>{const sheet=XLSX.utils.aoa_to_sheet(rows.map(row=>row.map(value=>cell(value,en))));sheet['!cols']=widths.map(wch=>({wch}));XLSX.utils.book_append_sheet(workbook,sheet,title);return sheet;};
 add(L('Resumen de duplicados','Review summary'),[
  [L('Análisis','Analysis'),L('Estado','Status'),L('Resultados','Results'),L('Pliegos','Tenders'),L('Ofertas','Bids')],
  ...[[L('Metadatos','Metadata'),meta,(meta.rows||[]).length],[L('Estructura','Outline'),outline,(outline.duplicateGroups||[]).length],[L('Contenido','Content'),content,(content.duplicateSentences||[]).length],[L('Imágenes','Images'),images,(images.duplicateImages||[]).length]].map(([label,section,count])=>[label,status(section.status),count,join(tenderFileIds),join(bidFileIds)]),
  [],[L('Indicador','Metric'),L('Valor','Value')],
  [L('Imágenes identificadas','Images identified'),images.totalImageCount||0],[L('Apartados del pliego excluidos','Tender outline entries excluded'),outline.tenderMatchedItemCount||0],[L('Frases del pliego excluidas','Tender sentences excluded'),content.tenderMatchedSentenceCount||0],[L('Frases analizadas','Sentences analyzed'),content.totalSentenceCount||0],
 ],[28,24,14,40,40]);
 add(L('Metadatos','Metadata'),[[L('Campo','Field'),L('Archivos duplicados','Matching files'),L('Archivos del mismo día','Same-day files'),...bidFileIds.map(name)],...(meta.rows||[]).map(row=>[labelForMetadata?.(row.key,row.label,language)||row.label||row.key,join(row.duplicate_file_ids),join(row.same_day_file_ids),...bidFileIds.map(id=>row.values?.[id]||'')])],[28,32,32,...bidFileIds.map(()=>32)]);
 const outlineSheet=add(L('Estructura duplicada','Outline matches'),[[L('N.º','No.'),L('Tipo','Type'),L('Título','Title'),L('Similitud','Similarity'),L('Archivos','Files'),L('Rutas','Paths')],...(outline.duplicateGroups||[]).map((group,index)=>[index+1,group.type==='duplicate'?L('Duplicado','Duplicate'):L('Similar','Similar'),group.title,Number(group.score||0),join(group.file_ids),(group.file_ids||[]).flatMap(id=>(group.paths?.[id]||[]).map(path=>`${name(id)}: ${path}`)).join('; ')])],[8,15,35,14,35,65]);
 const similaritySheet=add(L('Similitud de archivos','File similarity'),[[L('Archivo A','File A'),L('Archivo B','File B'),L('Similitud general','Overall similarity'),L('Títulos','Titles'),L('Rutas','Paths'),L('Orden','Order'),L('Apartados compartidos','Shared entries'),L('Riesgo','Risk')],...(outline.pairwiseSimilarities||[]).map(item=>[name(item.file_a_id),name(item.file_b_id),Number(item.score||0),Number(item.title_overlap||0),Number(item.path_overlap||0),Number(item.order_similarity||0),Number(item.shared_count||0),({high:L('Alto','High'),medium:L('Medio','Medium'),low:L('Bajo','Low'),none:L('Ninguno','None')})[item.risk]||item.risk||''])],[30,30,18,14,14,14,20,14]);
 for(let row=1;row<=(outline.duplicateGroups||[]).length;row++){const entry=outlineSheet[XLSX.utils.encode_cell({r:row,c:3})];if(entry)entry.z='0.00%';}
 for(let row=1;row<=(outline.pairwiseSimilarities||[]).length;row++)for(let column=2;column<=5;column++){const entry=similaritySheet[XLSX.utils.encode_cell({r:row,c:column})];if(entry)entry.z='0.00%';}
 add(L('Frases duplicadas','Repeated sentences'),[[L('N.º','No.'),L('Frase','Sentence'),L('Archivos','Files'),L('Apariciones por archivo','Occurrences by file'),L('Total','Total')],...(content.duplicateSentences||[]).map((item,index)=>[index+1,item.sentence,join(item.file_ids),(item.file_ids||[]).map(id=>`${name(id)} × ${Number(item.occurrences?.[id]||0)}`).join('; '),Object.values(item.occurrences||{}).reduce((sum,count)=>sum+Number(count||0),0)])],[8,75,35,55,14]);
 add(L('Imágenes duplicadas','Matching images'),[[L('N.º','No.'),L('Hash','Hash'),L('Archivos','Files'),L('Apariciones por archivo','Occurrences by file'),L('Ubicación','Location'),L('Texto anterior','Previous text')],...(images.duplicateImages||[]).map((item,index)=>{const locations=(item.file_ids||[]).flatMap(id=>(item.locations?.[id]||[]).map(location=>({id,location})));return [index+1,item.hash,join(item.file_ids),(item.file_ids||[]).map(id=>`${name(id)} × ${Number(item.occurrences?.[id]||0)}`).join('; '),locations.map(({id,location})=>`${name(id)}: ${location.directory||L('Sin apartado','No section')} (${L('imagen','image')} ${location.image_index??'?'})`).join('; '),locations.map(({id,location})=>`${name(id)}: ${location.previous_sentence||''}`).join('; ')];})],[8,40,35,45,65,75]);
 return XLSX.write(workbook,{bookType:'xlsx',type:'array',compression:true});
}
