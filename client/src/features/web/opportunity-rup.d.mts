type Fact = {label:string; value:string; page:number};
export function loadOpportunityRup(request:(path:string)=>Promise<{certificateId:string|null;facts:Fact[]}>):Promise<Fact[]>;
export function opportunityMatch(item:{classificationCode?:string}, facts:Fact[]):Array<{code:string;page:number;label:string}>;
export function opportunityRows<T extends {classificationCode?:string}>(rows:T[],facts:Fact[],prioritize:boolean):T[];
