export function matchReviewedExperience(classificationCode:string|undefined,facts:Array<{label:string;value:string;page:number}>):Array<{code:string;page:number;label:string}>;
export function prioritizeReviewed<T extends {classificationCode?:string}>(rows:T[],facts:Array<{label:string;value:string;page:number}>):T[];
