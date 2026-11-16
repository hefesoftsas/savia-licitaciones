function decimal(value) {
  const text=String(value ?? '').trim().replace(',', '.');
  if(text.length>80 || !/^[+-]?\d+(?:\.\d+)?$/.test(text))return null;
  const negative=text.startsWith('-'),unsigned=text.replace(/^[+-]/,''),[whole,fraction='']=unsigned.split('.');
  return {number:BigInt((negative?'-':'')+whole+fraction),scale:fraction.length};
}
export function requiresRupInterpretation(value) {
  const text=String(value??'').trim();
  return /^[+-]?\d[\d.,]*$/.test(text) && (!/^[+-]?\d+(?:[.,]\d+)?$/.test(text) || /^[+-]?\d{1,3}[.,]\d{3}$/.test(text));
}
export function compareRupNumber(value,threshold,operator,confirmed=false) {
  if(!confirmed && requiresRupInterpretation(value))return 'unknown';
  const left=decimal(value),right=decimal(threshold);
  if(!left||!right||!['gte','lte'].includes(operator))return 'unknown';
  const scale=Math.max(left.scale,right.scale),a=left.number*10n**BigInt(scale-left.scale),b=right.number*10n**BigInt(scale-right.scale);
  return (operator==='gte'?a>=b:a<=b)?'meets':'does_not_meet';
}
