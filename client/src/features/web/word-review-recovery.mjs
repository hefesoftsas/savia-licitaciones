import {fieldContext} from './word-field-assistance.mjs';
export function reviewMatchesFields(contexts,fields){return Array.isArray(contexts)&&contexts.length===fields.length&&fields.every((field,index)=>contexts[index]===fieldContext(field));}
