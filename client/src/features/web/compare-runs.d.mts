type Source={id:string;name:string;text:string};
type Criterion={id:string;name:string;tenderSourceId:string;tenderQuote:string;maxPoints:number|null;bidSourceId:string|null;bidQuote:string};
type Review={criterionId:string;status:string;score:number|null;note:string};
type Run={id:string;createdAt?:string;tenderSources:Source[];bidSources:Source[];result:{criteria:Criterion[]};reviews:Review[]};
export function compareRuns(runs:Run[]):Array<{criterion:Criterion;cells:Array<{criterion:Criterion;review:Review|null}|null>}>;
