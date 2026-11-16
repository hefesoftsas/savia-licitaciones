export function collectLegacyFictional(editor:any,previousAnswers?:string[]):any[];
export function parseFictional(answer:string,ids:number[]):{id:number;value:string}[]|null;
export function generateFictional(fields:any[],ask:(prompt:string)=>Promise<string>,language:string,progress?:(count:number)=>void):Promise<{id:number;value:string}[]>;
export type FictionalRecord={text:string;original:{text:string;html:string|null};scope:string;blockId:string};
export function applyFictional(editor:any,fields:any[],values:{id:number;value:string}[],token:string):{records:FictionalRecord[];failed:number};
export function undoFictional(editor:any,records:FictionalRecord[]):{restored:number;remaining:FictionalRecord[]};
