import type {SecopCategory,SecopDataset} from '@/shared/types/secop';
type Send=(path:string)=>Promise<{success:boolean;data:string[];message?:string}>;
type CategoryCache={peek:(dataset:SecopDataset,category:SecopCategory)=>string[]|null;load:(dataset:SecopDataset,category:SecopCategory,send:Send)=>Promise<string[]>};
export function createCategoryCache(options?:{now?:()=>number;ttl?:number}):CategoryCache;
export const categoryCache:CategoryCache;
