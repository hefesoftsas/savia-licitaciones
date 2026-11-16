import {Popover,PopoverTrigger,PopoverContent} from '@/shared/ui/primitives/popover';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/shared/ui/primitives/button';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import {MessageCircleQuestion} from 'lucide-react';

export type Question = { id: string; jobId: string; question: string; options: { label: string; description?: string; custom: boolean }[] };

export function AgentQuestionForm({ question, basePath, language, onAnswered }: { question: Question; basePath: string; language: 'es' | 'en'; onAnswered: (id: string) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (selected === null || (question.options[selected].custom && !answer.trim())) return;
    setBusy(true);
    try {
      await request(`${basePath}/${encodeURIComponent(question.id)}/answer`, { method: 'POST', json: { option: selected, ...(question.options[selected].custom ? { answer } : {}) } });
      onAnswered(question.id);
    } catch { showToast(language === 'es' ? 'No se pudo enviar la respuesta. Comprueba que la tarea siga activa e inténtalo de nuevo.' : 'Could not send the answer. Check that the task is still active and try again.', 'error'); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="web-stack">
    <p style={{ whiteSpace: 'pre-wrap' }}>{question.question}</p>
    {question.options.map((option, index) => <label key={index} className="web-consent"><input type="radio" name={`question-${question.id}`} checked={selected === index} onChange={() => setSelected(index)} /> <span>{option.label}{option.description && <><br /><small>{option.description}</small></>}</span></label>)}
    {selected !== null && question.options[selected].custom && <textarea aria-label={language === 'es' ? 'Tu respuesta' : 'Your answer'} value={answer} onChange={event => setAnswer(event.target.value)} maxLength={5000} required />}
    <Button type="submit" disabled={busy || selected === null || (selected !== null && question.options[selected].custom && !answer.trim())}>{language === 'es' ? 'Enviar respuesta' : 'Send answer'}</Button>
  </form>;
}

export default function WebJobQuestions({ projectId, language, basePath, compact=false, onQuestionsChange }: { compact?:boolean; projectId?: string; language: 'es' | 'en'; basePath?: string; onQuestionsChange?: (questions:Question[])=>void }) {
  const path = basePath || `/api/projects/${encodeURIComponent(projectId || '')}/job-questions`;
  const [questions, setQuestions] = useState<Question[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => { try { const data = await request<{ questions: Question[] }>(path); if (active) setQuestions(data.questions); } catch { /* Keep the last view until the connection recovers. */ } };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [path]);
  useEffect(()=>{onQuestionsChange?.(questions);},[questions,onQuestionsChange]);
  if (!questions.length) return null;
  const content=<section className="web-runner-questions" aria-label={language === 'es' ? 'Preguntas pendientes del agente' : 'Pending agent questions'}>
    <h3><MessageCircleQuestion size={20} aria-hidden="true"/>{language === 'es' ? 'El runner necesita tu respuesta' : 'The runner needs your answer'}</h3>
    <p>{language === 'es' ? 'La tarea está en pausa hasta que respondas.' : 'The task is paused until you answer.'}</p>
    {questions.map(question => <AgentQuestionForm key={question.id} question={question} basePath={path} language={language} onAnswered={id => setQuestions(current => current.filter(item => item.id !== id))} />)}
  </section>;
  return compact?<Popover><PopoverTrigger asChild><Button variant="outline" size="sm">{language==='es'?'Responder al runner':'Reply to runner'} ({questions.length})</Button></PopoverTrigger><PopoverContent className="web-runner-questions-popover" align="end">{content}</PopoverContent></Popover>:content;
}
