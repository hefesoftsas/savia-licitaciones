export function fieldContext(field:{text:string;length:number;contextBefore?:string;contextAfter?:string}):string;
export function sameField(a:any,b:any):boolean;
export function applyPendingField(editor:any,field:any,value:string,selectedRevision:number,currentRevision:number):boolean;
export function parseFieldAdvice(answer:string):{question:string;proposal:string;source:string}|null;
