export function fieldContext(field) {
 return `${field.contextBefore || ''}${field.text || ''}${(field.contextAfter || '').slice(0, Math.max(0,field.length-(field.text || '').length))}`.trim().slice(0,1000);
}
export function sameField(a,b) {
 return !!a && !!b && a.blockId===b.blockId && a.start===b.start && a.length===b.length && JSON.stringify(a.scope ?? null)===JSON.stringify(b.scope ?? null) && a.text===b.text;
}
export function applyPendingField(editor,field,value,selectedRevision,currentRevision) {
 if (!editor || selectedRevision!==currentRevision || !value.trim() || !collectPendingFields(editor).some(item=>sameField(item,field))) return false;
 return replaceWordMatch(editor,field,value);
}
export function parseFieldAdvice(answer) {
 try {
  const raw=String(answer).replace(/<suggested_questions>[\s\S]*?<\/suggested_questions>/gi,'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const value=JSON.parse(raw);
  if (!value || typeof value.question!=='string' || typeof value.proposal!=='string' || typeof value.source!=='string') return null;
  return {question:value.question.slice(0,1000),proposal:value.proposal.slice(0,4000),source:value.source.slice(0,1000)};
 } catch { return null; }
}
import {collectPendingFields} from './word-pending-fields.mjs';
import {replaceWordMatch} from './word-batch-assistance.mjs';
