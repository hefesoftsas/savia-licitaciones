const normal = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const metric=/\b(?:liquidez|endeudamiento|cobertura de intereses|rentabilidad del patrimonio|rentabilidad del activo)\b/g;
const rule=/(?:>=|≥|mayor o igual a|igual o mayor a|al menos|<=|≤|menor o igual a|igual o menor a|como maximo)\s*([+-]?\d+(?:[.,]\d+)?)\s*(?:veces)?\s*[.;]?\s*$/g;
export function parseTenderRule(quote){
 const text=normal(String(quote||'').trim());if(!text||text.length>300||/\b(?:excepto|salvo|cuando|si|entre|o bien|no|sin)\b/.test(text))return null;
 const metrics=[...text.matchAll(metric)],rules=[...text.matchAll(rule)],numbers=text.match(/[+-]?\d[\d.,]*/g)||[];
 if(metrics.length!==1||rules.length!==1||numbers.length!==1||metrics[0].index>rules[0].index||numbers[0]!==rules[0][1])return null;
 const token=rules[0][0].trim();return {operator:/^(?:>=|≥|mayor|igual o mayor|al menos)/.test(token)?'gte':'lte',threshold:rules[0][1]};
}
export function findTenderRules(documents){
 const result=[];
 for(const doc of documents){const lines=String(doc.text||'').split(/\r?\n/);for(let index=0;index<lines.length;index++){const quote=lines[index].trim();const parsed=parseTenderRule(quote);if(parsed)result.push({sourceId:doc.id,sourceName:doc.name,line:index+1,quote,...parsed});}}
 return result;
}
