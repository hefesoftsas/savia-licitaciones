import type {SecopProcess} from '@/shared/types/secop';
type Document = {id:string;extension:string;size:number|null};
type Send = (path:string,options?:{method?:string;json?:unknown})=>Promise<any>;
export const MAX_OPPORTUNITY_DOCUMENTS: number;
export function selectLoadedDocuments(documents:Document[]):string[];
export function selectableDocument(doc:Document):boolean;
export function prepareOpportunity(request:Send,process:SecopProcess,ids:string[]):Promise<{project:{id:string};imported:string[];queued:string[];failed:string[]}>;
