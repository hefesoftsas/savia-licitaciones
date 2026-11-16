export function makeBatches<T>(items:T[],size?:number):T[][];
export type BatchAdvice={id:number;proposal:string;source:string;question:string};
export function parseBatchAdvice(answer:string,allowedIds:number[]):BatchAdvice[]|null;
export function applyBatchAdvice(editor:any,fields:any[],items:{id:number;proposal:string}[],selectedRevision:number,currentRevision:number):{applied:number;failed:number;stale:boolean};
