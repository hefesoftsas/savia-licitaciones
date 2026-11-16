'use strict';
/** Rebuild visual lines from PDF text coordinates, retaining no inferred values. */
function layoutText(items) {
  const rows=[];
  for(const item of items){
    const text=String(item.str||'').trim();if(!text)continue;
    const x=Number(item.transform?.[4]),y=Number(item.transform?.[5]);if(!Number.isFinite(x)||!Number.isFinite(y))continue;
    let row=rows.find(candidate=>Math.abs(candidate.y-y)<2);
    if(!row){row={y,items:[]};rows.push(row);}
    row.items.push({x,text});
  }
  return rows.sort((a,b)=>b.y-a.y).map(row=>row.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ')).join('\n');
}
module.exports={layoutText};
