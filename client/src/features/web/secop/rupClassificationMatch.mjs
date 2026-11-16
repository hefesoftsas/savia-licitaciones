function classCode(raw){const text=String(raw||'').trim().replace(/^V1\./i,'');if(!/^(?:\d{6}|\d{8})$/.test(text))return '';const result=text.slice(0,6);return result.slice(0,2)!=='00'&&result.slice(2,4)!=='00'&&result.slice(4,6)!=='00'?result:'';}
export function matchReviewedExperience(classificationCode,facts){
 const target=classCode(classificationCode);if(!target)return [];
 return facts.filter(fact=>/^UNSPSC experiencia #\d+(?:\s|$)/i.test(fact.label)&&/^\d{8}$/.test(fact.value)&&classCode(fact.value)===target&&Number.isInteger(fact.page)&&fact.page>0).map(fact=>({code:fact.value,page:fact.page,label:fact.label}));
}
export function prioritizeReviewed(rows,facts){const match=[],rest=[];for(const row of rows)(matchReviewedExperience(row.classificationCode,facts).length?match:rest).push(row);return [...match,...rest];}
