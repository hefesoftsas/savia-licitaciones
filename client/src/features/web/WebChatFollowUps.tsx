import {Button} from '@/shared/ui/primitives/button';

type Job = {id: string; kind: string; state: string; payload: {fileIds?: string[]}; result: {answer?: string; followUps?: string[]} | null};
type Props = {job: Job; jobs: Job[]; selectedFiles: string[]; continueChat: boolean; busy: boolean; language: 'es' | 'en'; onSelect: (question: string) => void};
export function WebChatFollowUps({job, jobs, selectedFiles, continueChat, busy, language, onSelect}: Props) {
  const chat = jobs.filter(item => item.kind === 'tender-chat.send');
  const files = job.payload.fileIds || [];
  if (busy || !continueChat || chat[0]?.id !== job.id || job.state !== 'succeeded' || !job.result?.answer || chat.some(item => ['queued', 'running'].includes(item.state)) || files.length !== selectedFiles.length || !files.every(id => selectedFiles.includes(id))) return null;
  const suggestions = Array.isArray(job.result.followUps) ? [...new Set(job.result.followUps.filter(value => typeof value === 'string').map(value => value.trim()).filter(value => value && value.length <= 200))].slice(0, 3) : [];
  if (!suggestions.length) return null;
  const en = language === 'en';
  return <div className="web-chat-followups" aria-label={en ? 'Suggested follow-up questions' : 'Preguntas de seguimiento sugeridas'}>
    <p>{en ? 'Continue exploring' : 'Para seguir explorando'}</p>
    {suggestions.map(question => <Button type="button" variant="outline" size="sm" key={question} onClick={() => onSelect(question)}>{question}</Button>)}
  </div>;
}
