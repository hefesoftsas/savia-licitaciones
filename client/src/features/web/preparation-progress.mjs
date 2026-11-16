import {hasPendingFacts} from './preparation-readiness.mjs';
const active = job => ['queued','running'].includes(job.state);
export function preparationProgress({selectedFiles=[],analyses=[],outline={},facts={},plan={},jobs=[]}) {
 const nodes=[];const visit=items=>{for(const node of items||[]){if(node.children?.length)visit(node.children);else nodes.push(node);}};visit(plan.outline);
 const analysisDone=['project-overview','technical-score','response-requirements'].every(category=>analyses.some(item=>item.category===category&&item.current));
 const outlineDone=analysisDone&&!!plan.outline?.length;
 const factsDone=outlineDone&&facts.current===true&&facts.revision>0&&!facts.importReviewPending&&!(facts.groups||[]).some(group=>hasPendingFacts(group.title+' '+group.content));
 const reviewedWord=jobs.some(job=>job.kind==='technical-plan.export-word'&&job.state==='succeeded'&&job.artifactState==='stored'&&job.wordRevision>0&&!job.sourcesStale&&job.payload?.planVersion===plan.version);
 const draftDone=reviewedWord||factsDone&&nodes.length>0&&nodes.every(node=>typeof node.content==='string'&&node.content.trim()&&!hasPendingFacts(node.content));
 const exportDone=draftDone&&jobs.some(job=>job.kind==='technical-plan.export-word'&&job.state==='succeeded'&&job.artifactState==='stored'&&job.payload?.planVersion===plan.version);
 const complete=[selectedFiles.length>0,analysisDone,outlineDone,factsDone,draftDone,exportDone];
 const stage=kind=>kind==='technical-plan.analyze'?1:['technical-plan.generate-roots','technical-plan.expand-outline'].includes(kind)?2:kind.includes('facts')?3:kind==='technical-plan.export-word'||kind==='technical-plan.extract-template'?5:kind.startsWith('technical-plan.')?4:-1;
 const activeSteps=jobs.filter(active).map(job=>stage(job.kind)).filter(index=>index>=0);
 let resume=activeSteps[0]??(reviewedWord?5:complete.findIndex(value=>!value));if(resume<0)resume=5;
 return {resume,states:complete.map((done,index)=>index===2&&done?'complete':activeSteps.includes(index)?'running':done?'complete':index===resume?'current':'pending')};
}

export function preparationBlocker(step, snapshot, selectedFiles = []) {
 if (step === 0) return !selectedFiles.length ? 'documents' : selectedFiles.length > 50 ? 'document-limit' : null;
 if (step < 1 || step > 4) return null;
 if (!snapshot) return 'loading';
 const progress = preparationProgress({...snapshot, selectedFiles});
 if (progress.states[step] === 'complete') return null;
 if (step === 1) return 'analyses';
 if (step === 2) return 'outline';
 if (step === 3) return 'facts';
 if (progress.states[3] !== 'complete') return 'facts-before-draft';
 const nodes = [];
 const visit = items => { for (const node of items || []) node.children?.length ? visit(node.children) : nodes.push(node); };
 visit(snapshot.plan?.outline);
 if (!nodes.length) return 'outline';
 if (nodes.some(node => !node.content?.trim())) return 'drafts';
 return 'pending-values';
}
