import {makeBatches} from './word-batch-assistance.mjs';
import {fieldContext} from './word-field-assistance.mjs';

export function collectLegacyFictional(editor, previousAnswers=[]) {
 const prefixes=['DATO FICTICIO DE PRUEBA ','TEST DATA '];
 const generic=prefixes.flatMap(prefix=>editor.findMatches(prefix).flatMap(match=>{
  const digits=match.contextAfter?.match(/^\d+/)?.[0];
  return digits?[{...match,text:match.text+digits,length:match.length+digits.length,contextAfter:match.contextAfter.slice(digits.length)}]:[];
 }));
 const prior=[]; for(const answer of previousAnswers){try{for(const row of JSON.parse(String(answer).replace(/<suggested_questions>[\s\S]*?<\/suggested_questions>/gi,'').trim())){if(typeof row?.value==='string'&&/^DATO FICTICIO DE PRUEBA\s*[-–—:]/i.test(row.value))prior.push(row.value);}}catch{}}
 const historical=[];for(const probe of editor.findMatches('DATO FICTICIO DE PRUEBA - ')){const prefix=probe.text+(probe.contextAfter||'').slice(0,30);for(const value of prior.filter(value=>value.startsWith(prefix))){const found=editor.findMatches(value,{matchCase:true}).filter(item=>item.blockId===probe.blockId&&item.start===probe.start&&JSON.stringify(item.scope??null)===JSON.stringify(probe.scope??null));if(found.length===1){historical.push(found[0]);break;}}}
 return [...generic,...historical];
}
export function parseFictional(answer, ids) {
 try {
  const items=JSON.parse(String(answer).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
  if(!Array.isArray(items)||items.length!==ids.length)return null;
  const map=new Map(); for(const row of items){if(!Number.isSafeInteger(row.id)||!ids.includes(row.id)||map.has(row.id)||typeof row.value!=='string'||!row.value.trim()||row.value.length>1000)return null;const value=row.value.trim().replace(/^(?:\[?\s*(?:dato|valor|ejemplo)\s+(?:ficticio|simulado|de prueba)(?:\s+de prueba)?\s*\]?\s*[:—–-]\s*)/i,'').trim();if(!value)return null;map.set(row.id,value);}
  return ids.map(id=>({id,value:map.get(id)}));
 } catch{return null;}
}
export async function generateFictional(fields, ask, language, progress=()=>{}) {
 const items=fields.map((field,id)=>({id,context:fieldContext(field).slice(-240)})); const result=[];
 for(const batch of makeBatches(items,20)){
  const prompt=`Genera datos completamente ficticios y verosímiles para probar un borrador de licitación. Usa los documentos solo como contexto y no afirmes que los datos inventados son reales. Conserva coherencia entre campos y usa valores breves, sin etiquetas ni aclaraciones. Responde únicamente un arreglo JSON con un objeto {"id": número, "value": "dato ficticio"} por campo, sin dejar campos vacíos. Idioma: ${language}. Valores ficticios ya generados para mantener coherencia: ${JSON.stringify(result.slice(-10).map(({id,value})=>({id,value:value.slice(0,120)})))}. Campos: ${JSON.stringify(batch)}`;
  const values=parseFictional(await ask(prompt),batch.map(x=>x.id));if(!values)throw Error('invalid_answer'); result.push(...values);progress(result.length);
 }
 return result;
}
const escapeHtml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function applyFictional(editor,fields,values,token) {
 const records=[];let failed=0;
 for(const row of [...values].sort((a,b)=>{const x=fields[a.id],y=fields[b.id];return (y.paragraphIndex??0)-(x.paragraphIndex??0)||y.start-x.start;})){
  try {
   const field=fields[row.id];if(!field||!editor.selectMatch(field).ok){failed++;continue;}
   const original=editor.surface.copyFlavours();if(!original.text||original.text.length!==field.length){failed++;continue;}
   const text=row.value;
   if(!editor.surface.pasteRich(text,`<span style="font-family: Courier New">${escapeHtml(text)}</span>`)){failed++;continue;}
   records.push({text,original,scope:JSON.stringify(field.scope??null),blockId:field.blockId});
  } catch { failed++; }
 }
 return {records,failed};
}
export function undoFictional(editor,records) {
 let restored=0;const remaining=[];
 for(const record of records){
  try { const matches=editor.findMatches(record.text,{matchCase:true}).filter(m=>m.blockId===record.blockId&&JSON.stringify(m.scope??null)===record.scope&&m.text===record.text);
  if(matches.length!==1||!editor.selectMatch(matches[0]).ok||!editor.surface.pasteRich(record.original.text,record.original.html)){remaining.push(record);continue;} restored++; } catch { remaining.push(record); }
 }
 return {restored,remaining};
}
