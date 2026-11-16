// A missing-mode task created before retained-word snapshots cannot be assessed reliably.
export function assessTechnicalWordBudget(payload,drafts){
 const options=payload?.planningOptions,min=options?.minimumWords||0,max=options?.maximumWords||0;
 if(!min&&!max)return null;
 if(!Array.isArray(payload.targets)||!payload.targets.length||!Array.isArray(drafts))throw new Error('Invalid word budget input.');
 if(payload.mode==='missing'&&!Number.isSafeInteger(payload.existingWords))return null;
 const existing=payload.mode==='missing'?payload.existingWords:0,targets=new Set(payload.targets),seen=new Set();
 if(existing<0||targets.size!==payload.targets.length)throw new Error('Invalid word budget input.');
 let words=existing;
 for(const draft of drafts){if(!targets.has(draft.nodeId)||seen.has(draft.nodeId)||!Number.isSafeInteger(draft.wordCount)||draft.wordCount<0)throw new Error('Invalid word budget input.');seen.add(draft.nodeId);words+=draft.wordCount;}
 const missingChapters=targets.size-seen.size,status=missingChapters?'incomplete':min&&words<min?'below':max&&words>max?'above':'within';
 return {status,totalWords:words,minimumWords:min,maximumWords:max,missingChapters};
}

// Mirrors desktop's bounded, deviation-first allocation. Retained chapters only
// contribute to the total; they are never candidates for rewriting.
export function planTechnicalWordAdjustment(payload,chapters){
 const assessment=assessTechnicalWordBudget(payload,chapters);
 if(!assessment||['incomplete','within'].includes(assessment.status))return null;
 for(const chapter of chapters)if(!Number.isSafeInteger(chapter.editableWords)||chapter.editableWords<0||chapter.editableWords>chapter.wordCount||!Number.isSafeInteger(chapter.targetWords)||chapter.targetWords<0)throw new Error('Invalid adjustment input.');
 const direction=assessment.status==='above'?'shrink':'expand',sign=direction==='shrink'?1:-1,bound=direction==='shrink'?assessment.maximumWords:assessment.minimumWords;
 let margin=Math.round(bound*.02);if(assessment.minimumWords&&assessment.maximumWords)margin=Math.min(margin,Math.floor((assessment.maximumWords-assessment.minimumWords)/2));
 const goal=bound-sign*margin,sections=chapters.map(chapter=>({...chapter,amount:0,limit:Math.floor(chapter.editableWords*(direction==='shrink'?.4:.6)),deviation:chapter.targetWords>0?(chapter.wordCount-chapter.targetWords)*sign:0}));
 let remaining=Math.abs(assessment.totalWords-goal);
 const allocate=(section,available)=>{const amount=Math.min(available,Math.max(remaining,100));if(amount<100)return;section.amount+=amount;remaining-=amount;};
 for(const section of sections.filter(item=>item.deviation>0).sort((a,b)=>b.deviation-a.deviation)){if(remaining<=0)break;allocate(section,Math.min(section.deviation,section.limit));}
 for(const section of [...sections].sort((a,b)=>b.limit-a.limit)){if(remaining<=0)break;allocate(section,section.limit-section.amount);}
 return {direction,totalWords:assessment.totalWords,goal,shortfall:Math.max(0,remaining),jobs:sections.filter(section=>section.amount>0).map(section=>({nodeId:section.nodeId,fromWords:section.wordCount,targetWords:section.wordCount-sign*section.amount}))};
}
