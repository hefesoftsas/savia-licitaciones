import {imageReferences,safeParts,supportedImage} from './desktop-assets.mjs';
const defaults={projectName:'',projectType:'government',industry:'',constructionUnit:'',location:'',constructionContent:'',constructionPeriodYears:'2',operationPeriodYears:'20',totalInvestment:'',fundingSource:''};
function parse(value,fallback){if(!value)return fallback;try{return JSON.parse(value);}catch{throw new Error('El informe de viabilidad contiene datos JSON inválidos.');}}
export function extractFeasibilityAssets(nodes,files){
 const assets=[],missingAssets=[],seen=new Set();
 const visit=items=>{for(const node of items){for(const item of imageReferences(node.content||'')){
  if(!item.reference||/^data:/i.test(item.reference))continue;const id=JSON.stringify([item.kind,item.reference]);if(seen.has(id))continue;seen.add(id);if(seen.size>1000)throw new Error('El informe contiene demasiadas imágenes.');
  const match=item.kind==='url'?/^savia-asset:\/\/(imported-images|generated-images)\/(.*)$/i.exec(item.reference):null;if(!match){missingAssets.push({...item,reason:'outside_backup'});continue;}const parts=safeParts(match[2]);if(!parts){missingAssets.push({...item,reason:'unsafe_path'});continue;}
  const path=`workspace/${match[1].toLowerCase()}/${parts.join('/')}`,bytes=files.get(path);if(!bytes){missingAssets.push({...item,reason:'not_found'});continue;}if(bytes.length>25*1024*1024){missingAssets.push({...item,reason:'too_large'});continue;}if(!supportedImage(bytes)){missingAssets.push({...item,reason:'unsupported_format'});continue;}assets.push({...item,bytes});
 }visit(node.children||[]);}};visit(nodes);return {assets,missingAssets};
}
export function readDesktopFeasibility(db,files,hasTable){
 if(!hasTable('feasibility_report_meta'))return null;
 const meta=db.prepare('SELECT * FROM feasibility_report_meta WHERE id=1').get();if(!meta)return null;
 const info=parse(meta.project_info_json,{}),sourceFiles=parse(meta.source_files_json,[]),references=parse(meta.reference_document_ids_json,[]);
 if(!info||typeof info!=='object'||Array.isArray(info)||!Array.isArray(sourceFiles)||!Array.isArray(references))throw new Error('Los datos del informe de viabilidad no son compatibles.');
 const projectInfo={...defaults,...info};
 const rows=hasTable('feasibility_report_outline_nodes')?db.prepare('SELECT * FROM feasibility_report_outline_nodes ORDER BY level,parent_node_id,sort_order').all():[];
 const nodes=new Map();for(const row of rows){if(!row.node_id||nodes.has(row.node_id))throw new Error('El índice del informe de viabilidad no es válido.');const ids=parse(row.knowledge_item_ids_json,[]);if(!Array.isArray(ids))throw new Error('Las referencias del informe no son válidas.');nodes.set(row.node_id,{id:row.node_id,title:row.title,description:row.description||'',knowledge_item_ids:ids,content:row.content||'',children:[]});}
 const roots=[];for(const row of rows){const node=nodes.get(row.node_id);if(row.parent_node_id){const parent=nodes.get(row.parent_node_id);if(!parent)throw new Error('El índice del informe tiene capítulos sin padre.');parent.children.push(node);}else roots.push(node);}
 const visit=(node,seen)=>{if(seen.has(node.id))throw new Error('El índice del informe contiene un ciclo.');seen.add(node.id);for(const child of node.children)visit(child,seen);};const seen=new Set();for(const node of roots)visit(node,seen);if(seen.size!==nodes.size)throw new Error('El índice del informe no es válido.');
 const sources=sourceFiles.map(file=>{const relative=typeof file?.markdownPath==='string'?file.markdownPath.replace(/\\/g,'/'):'';const safe=relative.startsWith('feasibility-report/sources/')&&relative.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!/[\x00-\x1f:]/.test(part));const bytes=safe?files.get(`workspace/${relative}`):null;return {id:file?.id||'',fileName:file?.fileName||'',...(bytes?{bytes}:{missing:true,reason:safe?'not_found':'unsafe_path'})};});
 const tasks=hasTable('feasibility_report_tasks')?db.prepare('SELECT * FROM feasibility_report_tasks').all().map(row=>({...row,status:['running','pausing'].includes(row.status)?'interrupted':row.status})):[];
 return {...extractFeasibilityAssets(roots,files),state:{step:meta.step||'materials',projectInfo,sourceFiles,analysisMarkdown:meta.analysis_markdown||'',outlineTemplate:meta.outline_template||'government',targetWords:meta.target_words||30000,referenceDocumentIds:references,keyParametersMarkdown:meta.key_parameters_markdown||'',outlineData:rows.length?{project_name:meta.outline_project_name||'',project_overview:meta.outline_project_overview||'',outline:roots}:null},sources,tasks};
}
