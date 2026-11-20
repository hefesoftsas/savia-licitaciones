export function proposalForOutline(jobs, expansions, hasSavedOutline) {
 const newest=jobs[0];
 if(!newest||newest.discarded) return undefined;
 if(hasSavedOutline&&expansions.some(item=>item.appliedVersion!=null&&item.selectionJobId===newest.id)) return undefined;
 return newest;
}

export function needsOutlineReview(proposal, selection) {
 return Boolean(proposal?.state === 'succeeded' && proposal.result?.outline?.length && !proposal.stale &&
   !(selection?.current && selection.jobId === proposal.id));
}
