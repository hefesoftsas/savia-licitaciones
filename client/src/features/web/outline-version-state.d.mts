export function proposalForOutline<T extends {id:string;discarded?:boolean}>(jobs:T[],expansions:{selectionJobId?:string;appliedVersion:number|null}[],hasSavedOutline:boolean):T|undefined;
