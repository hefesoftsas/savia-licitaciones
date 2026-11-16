import type {TextMatch} from '@docx-editor.dev/core';
export function makeTestAnswers(fields:TextMatch[],en:boolean):{id:number;proposal:string}[];
export function applyTestAnswers(editor:unknown,fields:TextMatch[],apply?:Function,en?:boolean):number;
