const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,expected)=>record(value)&&Object.keys(value).length===expected.length&&expected.every(key=>Object.hasOwn(value,key));
const invalid=()=>{throw new Error('Revisión de coherencia inválida.');};
function protectedTables(text){
 const lines=String(text).replace(/\r\n/g,'\n').split('\n'),visible=[];let fence=null;
 for(const line of lines){const marker=/^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];if(marker){if(!fence)fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length)fence=null;visible.push('');continue;}visible.push(fence?'':line);}
 const tables=[],separator=/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
 for(let i=0;i+1<visible.length;i++){if(!visible[i].includes('|')||!separator.test(visible[i+1]))continue;const start=i;i+=2;while(i<visible.length&&visible[i].trim()&&!/^ {0,3}(?:#{1,6}\s|>|[-+*]\s|\d+[.)]\s)/.test(visible[i]))i++;tables.push(visible.slice(start,i).join('\n'));i--;}
 const html=(visible.join('\n').match(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi)||[]);return {markdown:tables,html};
}
export function validateTechnicalConsistency(value,targetIds,referenceIds,originals){
 if(!Array.isArray(targetIds)||!targetIds.length||targetIds.length>500||!Array.isArray(referenceIds)||[...targetIds,...referenceIds].some(id=>typeof id!=='string'||!id)||new Set([...targetIds,...referenceIds]).size!==targetIds.length+referenceIds.length||!keys(value,['checked_ids','sections','unresolved'])||!Array.isArray(value.checked_ids)||value.checked_ids.length!==targetIds.length+referenceIds.length||new Set(value.checked_ids).size!==value.checked_ids.length||value.checked_ids.some(id=>![...targetIds,...referenceIds].includes(id))||!Array.isArray(value.sections)||value.sections.length>targetIds.length||!Array.isArray(value.unresolved)||value.unresolved.length>500)invalid();
 const targets=new Set(targetIds),allowed=new Set([...targetIds,...referenceIds]),byId=new Map();let length=0;
 const source=originals?new Map(originals.map(item=>[item.id,item.content])):null;
 for(const item of value.sections){if(!keys(item,['id','content'])||!targets.has(item.id)||byId.has(item.id)||typeof item.content!=='string'||!item.content.trim()||item.content.length>200000)invalid();if(source){const original=source.get(item.id);if(typeof original!=='string')invalid();const links=text=>(text.match(/!?\[[^\]]*\]\([^)]+\)/g)||[]).sort();if(JSON.stringify(links(original))!==JSON.stringify(links(item.content))||JSON.stringify(protectedTables(original))!==JSON.stringify(protectedTables(item.content)))invalid();}length+=item.content.length;byId.set(item.id,item);}
 if(length>1000000)invalid();
 for(const issue of value.unresolved){if(!keys(issue,['section_ids','description'])||!Array.isArray(issue.section_ids)||!issue.section_ids.length||issue.section_ids.length>500||issue.section_ids.some(id=>typeof id!=='string'||!allowed.has(id))||new Set(issue.section_ids).size!==issue.section_ids.length||typeof issue.description!=='string'||!issue.description.trim()||issue.description.length>2000)invalid();}
 return {checked_ids:[...targetIds,...referenceIds],sections:targetIds.filter(id=>byId.has(id)).map(id=>byId.get(id)),unresolved:value.unresolved};
}

export function applyTechnicalConsistencyEdits(value,chapters,referenceIds){
 if(!keys(value,['checked_ids','edits','unresolved'])||!Array.isArray(chapters)||!chapters.length||!Array.isArray(value.edits)||value.edits.length>chapters.length)invalid();
 const targetIds=chapters.map(item=>item.id),source=new Map(chapters.map(item=>[item.id,item.content])),seen=new Set(),sections=[];
 for(const item of value.edits){if(!keys(item,['id','changes'])||!source.has(item.id)||seen.has(item.id)||!Array.isArray(item.changes)||!item.changes.length||item.changes.length>50)invalid();seen.add(item.id);const original=source.get(item.id);if(typeof original!=='string')invalid();const changes=[];
  for(const change of item.changes){if(!keys(change,['before','after'])||typeof change.before!=='string'||!change.before||change.before.length>16000||typeof change.after!=='string'||change.after.length>16000||change.before===change.after)invalid();const start=original.indexOf(change.before);if(start<0||original.indexOf(change.before,start+1)!==-1)invalid();changes.push({start,end:start+change.before.length,after:change.after});}
  changes.sort((a,b)=>a.start-b.start);if(changes.some((change,index)=>index>0&&changes[index-1].end>change.start))invalid();let content=original;for(const change of changes.reverse())content=content.slice(0,change.start)+change.after+content.slice(change.end);sections.push({id:item.id,content});
 }
 return validateTechnicalConsistency({checked_ids:value.checked_ids,sections,unresolved:value.unresolved},targetIds,referenceIds,chapters);
}
