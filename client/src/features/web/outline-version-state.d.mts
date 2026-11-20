export function proposalForOutline<T extends {id:string;discarded?:boolean}>(jobs:T[],expansions:{selectionJobId?:string;appliedVersion:number|null}[],hasSavedOutline:boolean):T|undefined;
export function needsOutlineReview(proposal: {id:string;state:string;stale:boolean;result:{outline?:unknown[]}|null}|undefined, selection:{jobId:string;current:boolean}|null):boolean;
