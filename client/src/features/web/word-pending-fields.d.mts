import type {Editor, TextMatch} from '@docx-editor.dev/core';
export const pendingPrefixes: string[];
export function collectPendingFields(editor: Pick<Editor,'findMatches'>): TextMatch[];
export function pendingFieldIndex(fields:TextMatch[],active:TextMatch|null,direction:number):number;
