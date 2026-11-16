'use strict';
const digits = { '零':0, '〇':0, '一':1, '二':2, '两':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9 };
const units = { '十':10, '百':100, '千':1000 };
function number(value) {
  if (/^\d+$/.test(value)) return Number(value);
  let total=0, digit=0;
  for (const char of value) {
    if (Object.hasOwn(digits,char)) digit=digits[char];
    else if (Object.hasOwn(units,char)) { total+=(digit||1)*units[char]; digit=0; }
    else return null;
  }
  const result=total+digit;return result>0?result:null;
}
function displayGeneratedOutlineTitle(value, locale) {
  const title=String(value || '');if(locale!=='es')return title;
  return title.replace(/^第([零〇一二两三四五六七八九十百千\d]+)(章|节|条)\s*/, (original,raw,unit)=>{
    const parsed=number(raw);return parsed===null?original:`${unit==='章'?'Capítulo':unit==='节'?'Sección':'Artículo'} ${parsed} `;
  }).trimEnd();
}
function exportGeneratedOutlineTitle(value, locale, heading) {
  const original=String(value || '');
  const displayed=displayGeneratedOutlineTitle(original,locale);
  const numbered=heading?.numbering_format === 'outline-decimal' || (heading?.numbering_format === 'custom' && Boolean(heading.numbering_template));
  if (displayed === original || !numbered) return displayed;
  return displayed.replace(/^(?:Capítulo|Sección|Artículo) \d+\s*/, '') || displayed;
}
module.exports={displayGeneratedOutlineTitle,exportGeneratedOutlineTitle};
