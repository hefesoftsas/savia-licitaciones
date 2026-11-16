export function hasPendingFacts(value: unknown): boolean;
export function incompleteChapters<T extends {content?:string;children?:T[]}>(outline?:T[]):T[];

export function pendingFactLocations(groups?:{id:string;title:string;content:string}[]):{groupId:string;field:'title'|'content';start:number;end:number}[];
