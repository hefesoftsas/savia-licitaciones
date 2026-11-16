import {WebLoading} from './WebLoading';
import {RefreshCw} from 'lucide-react';
import { useEffect, useState } from 'react';
import MarkdownRenderer from '@/shared/ui/MarkdownRenderer';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import { request } from './api.mjs';

type Message = { id: string; role: string; content: string; status: string; createdAt: string; followupsJson: string | null };

function followups(value: string | null): string[] {
  try { const data = JSON.parse(value || '{}'); return Array.isArray(data.questions) ? data.questions.filter((item: unknown): item is string => typeof item === 'string') : []; } catch { return []; }
}

export default function WebImportedChat({ projectId, language }: { projectId: string; language: 'es' | 'en' }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [refresh, setRefresh] = useState(0);
  const en = language === 'en';
  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false);
    void request<{ messages: Message[] }>(`/api/projects/${encodeURIComponent(projectId)}/imported-chat`)
      .then(result => { if (active) setMessages(result.messages); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, refresh]);
  if (!loading && !failed && !messages.length) return null;
  return <details className="web-imported-chat">
    <summary>{en ? 'Conversation from a backup' : 'Conversación de una copia de seguridad'}{messages.length > 0 && ` (${messages.length})`}</summary>
    <p>{en ? 'Historical messages may refer to older or unavailable documents. They are not sent with new questions, and unfinished tasks are not resumed.' : 'Los mensajes históricos pueden referirse a documentos anteriores o no disponibles. No se envían con las nuevas consultas y las tareas inconclusas no se reanudan.'}</p>
    {loading && <WebLoading message={en?'Loading conversation…':'Cargando conversación…'}/>}
    {failed && <div role="alert"><p>{en ? 'Could not load the imported conversation.' : 'No se pudo cargar la conversación importada.'}</p><Button icon={RefreshCw} iconOnly variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>{en ? 'Retry' : 'Reintentar'}</Button></div>}
    {!loading && !failed && messages.map((message, index) => <article key={`${message.id}:${index}`}>
      <div className="web-imported-chat-meta"><strong>{message.role === 'user' ? (en ? 'You' : 'Tú') : message.role === 'assistant' ? (en ? 'Assistant' : 'Asistente') : message.role}</strong><span>{message.createdAt}</span><span>{message.status === 'complete' ? (en ? 'Complete' : 'Completado') : message.status === 'running' ? (en ? 'Running when saved' : 'En ejecución al guardar') : message.status === 'interrupted' ? (en ? 'Interrupted' : 'Interrumpido') : message.status === 'error' ? 'Error' : message.status}</span></div>
      {message.content && <MarkdownRenderer allowRawHtml={false}>{message.content}</MarkdownRenderer>}
      {followups(message.followupsJson).length > 0 && <div><p>{en ? 'Suggested questions' : 'Preguntas sugeridas'}</p><ul>{followups(message.followupsJson).map((question, i) => <li key={i}>{question}</li>)}</ul></div>}
    </article>)}
  </details>;
}
