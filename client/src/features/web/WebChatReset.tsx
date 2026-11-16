import {useState} from 'react';
import {Button} from '@/shared/ui/primitives/button';
import AppDialog from '@/shared/ui/AppDialog';

type Props = {language: 'es' | 'en'; jobs: {kind: string; state: string}[]; busy: boolean; onClear: () => Promise<boolean>};
export function WebChatReset({language, jobs, busy, onClear}: Props) {
  const [open, setOpen] = useState(false), en = language === 'en';
  const chat = jobs.filter(job => job.kind === 'tender-chat.send');
  const disabled = busy || !chat.length || chat.some(job => ['queued', 'running'].includes(job.state));
  return <>
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>{en ? 'New conversation' : 'Nueva conversación'}</Button>
    <AppDialog open={open} preventClose={busy} onOpenChange={value => {if (!busy) setOpen(value);}} title={en ? 'Start a new conversation?' : '¿Iniciar una nueva conversación?'} description={en ? 'The current web conversation will be deleted. Your documents and imported history will remain available.' : 'Se eliminará la conversación web actual. Tus documentos y el historial importado permanecerán disponibles.'} actions={<><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{en ? 'Cancel' : 'Cancelar'}</Button><Button variant="destructive" disabled={busy} onClick={() => void onClear().then(ok => {if (ok) setOpen(false);})}>{en ? 'Delete conversation' : 'Eliminar conversación'}</Button></>} />
  </>;
}
