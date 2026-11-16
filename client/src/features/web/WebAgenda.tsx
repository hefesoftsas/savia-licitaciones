import { WebLoading } from './WebLoading';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Bell, CalendarDays, CheckCircle2, Clock, FileCheck2, FolderOpen, ListTodo, PenLine, Plus, RefreshCw, Search, ShieldAlert, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { SelectField } from '@/shared/ui/SelectField';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/primitives/sheet';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import { shiftMonth } from './agenda-calendar.mjs';
import { AgendaCalendarView } from './WebAgendaCalendar';

type Item = {
  id: string;
  kind: 'task' | 'request' | 'deadline' | 'certificate';
  title: string;
  date: string;
  processId?: string;
  processTitle?: string;
  deadlineVerified?: boolean;
  deadlineSource?: string;
  checkedAt?: string;
  watchError?: string;
};

type WidgetId='summary'|'calendar'|'events';
const widgetDefaults:WidgetId[]=['summary','calendar','events'];

type KindFilter = 'all' | 'deadline' | 'task' | 'request' | 'certificate';
type HorizonFilter = 'all' | 'upcoming' | 'month' | 'overdue';

function getBogotaToday(): { iso: string; year: number; month: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map(part => [part.type, part.value]),
  );
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    month: Number(parts.month),
  };
}

function diffDaysFrom(todayIso: string, targetIso: string): number {
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const [iy, im, id] = targetIso.split('-').map(Number);
  const t0 = Date.UTC(ty, tm - 1, td);
  const t1 = Date.UTC(iy, im - 1, id);
  return Math.round((t1 - t0) / 86_400_000);
}

export default function WebAgenda({
  language,
  projects = [],
  onOpenProject,
  onOpenCertificates,
  remindersSlot,
}: {
  language: 'es' | 'en';
  projects?: { id: string; title: string }[];
  onOpenProject: (id: string, tab?: 'documents' | 'prepare' | 'tracking', focus?: 'prepare' | 'submit' | 'after') => void;
  onOpenCertificates: () => void;
  remindersSlot?: ReactNode;
}) {
  const en = language === 'en';
  const { showToast } = useToast();
  const todayInfo = useMemo(() => getBogotaToday(), []);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [month, setMonth] = useState(() => ({ year: todayInfo.year, month: todayInfo.month }));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [horizonFilter, setHorizonFilter] = useState<HorizonFilter>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [taskProjectId, setTaskProjectId] = useState(() => projects[0]?.id || '');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(() => todayInfo.iso);
  const [taskErrors, setTaskErrors] = useState<{ projectId?: string; title?: string; dueDate?: string }>({});
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [widgetOrder,setWidgetOrder]=useState<WidgetId[]>(widgetDefaults),[widgetDraft,setWidgetDraft]=useState<WidgetId[]>(widgetDefaults),[editingWidgets,setEditingWidgets]=useState(false),[widgetsSaving,setWidgetsSaving]=useState(false),[widgetsReady,setWidgetsReady]=useState(false),[draggedWidget,setDraggedWidget]=useState<WidgetId|null>(null),[dropWidget,setDropWidget]=useState<{id:WidgetId;after:boolean}|null>(null);
  useEffect(()=>{let active=true;void request<{order:WidgetId[]}>('/api/agenda-layout').then(data=>{if(active){setWidgetOrder(data.order);setWidgetDraft(data.order);setWidgetsReady(true);}}).catch(()=>{if(active)showToast(en?'Could not load agenda layout.':'No se pudo cargar la organización de la agenda.','error');});return()=>{active=false;};},[]);
  const widgetNames:Record<WidgetId,string>={summary:en?'Summary':'Resumen',calendar:en?'Calendar':'Calendario',events:en?'Events':'Eventos'};
  const moveWidget=(id:WidgetId,target:number)=>setWidgetDraft(current=>{const next=[...current],index=next.indexOf(id);if(index<0||target<0||target>=next.length)return current;next.splice(index,1);next.splice(target,0,id);return next;});
  const saveWidgets=async()=>{if(widgetsSaving)return;setWidgetsSaving(true);try{const result=await request<{order:WidgetId[]}>('/api/agenda-layout',{method:'PUT',json:{order:widgetDraft}});setWidgetOrder(result.order);setWidgetDraft(result.order);setEditingWidgets(false);}catch{showToast(en?'Could not save the agenda layout.':'No se pudo guardar la organización de la agenda.','error');}finally{setWidgetsSaving(false);}};
  const widgetAttrs=(id:WidgetId)=>({style:{order:10+(editingWidgets?widgetDraft:widgetOrder).indexOf(id)},'data-widget-drop':dropWidget?.id===id?(dropWidget.after?'after':'before'):undefined,onDragOver:(event:React.DragEvent<HTMLElement>)=>{if(!editingWidgets||!draggedWidget||draggedWidget===id)return;event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();setDropWidget({id,after:event.clientY>rect.top+rect.height/2});},onDrop:(event:React.DragEvent<HTMLElement>)=>{if(!draggedWidget||draggedWidget===id)return;event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();const after=event.clientY>rect.top+rect.height/2;setWidgetDraft(current=>{const next=current.filter(item=>item!==draggedWidget);const target=next.indexOf(id)+(after?1:0);next.splice(target,0,draggedWidget);return next;});setDraggedWidget(null);setDropWidget(null);}});
  const widgetControls=(id:WidgetId)=>editingWidgets?<div className="web-agenda-widget-controls"><button type="button" draggable disabled={widgetsSaving} className="web-agenda-widget-grip" aria-label={`${en?'Drag':'Arrastrar'} ${widgetNames[id]}`} onDragStart={event=>{setDraggedWidget(id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);}} onDragEnd={()=>{setDraggedWidget(null);setDropWidget(null);}}><GripVertical size={16} aria-hidden="true"/><span>{widgetNames[id]}</span></button><div><Button icon={ArrowUp} iconOnly size="sm" variant="ghost" disabled={widgetsSaving||widgetDraft.indexOf(id)===0} onClick={()=>moveWidget(id,widgetDraft.indexOf(id)-1)}>{en?`Move ${widgetNames[id]} up`:`Subir ${widgetNames[id]}`}</Button><Button icon={ArrowDown} iconOnly size="sm" variant="ghost" disabled={widgetsSaving||widgetDraft.indexOf(id)===widgetDraft.length-1} onClick={()=>moveWidget(id,widgetDraft.indexOf(id)+1)}>{en?`Move ${widgetNames[id]} down`:`Bajar ${widgetNames[id]}`}</Button></div></div>:null;


  useEffect(() => {
    if (!taskProjectId && projects.length > 0) setTaskProjectId(projects[0].id);
  }, [projects, taskProjectId]);

  useEffect(() => {
    if (selectedDate) setTaskDueDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void request<{ items: Item[] }>('/api/agenda')
      .then(data => {
        if (active) setItems(data.items);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  const counts: Record<string, number> = {};
  for (const item of items) counts[item.date] = (counts[item.date] || 0) + 1;

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.title);
    for (const item of items) {
      if (item.processId && item.processTitle && !map.has(item.processId)) {
        map.set(item.processId, item.processTitle);
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [projects, items]);

  const stats = useMemo(() => {
    let next7Days = 0;
    let tasks = 0;
    let deadlines = 0;
    let requestsAndCerts = 0;
    let overdue = 0;
    for (const item of items) {
      const diff = diffDaysFrom(todayInfo.iso, item.date);
      if (diff >= 0 && diff <= 7) next7Days += 1;
      if (diff < 0) overdue += 1;
      if (item.kind === 'task') tasks += 1;
      else if (item.kind === 'deadline') deadlines += 1;
      else requestsAndCerts += 1;
    }
    return { next7Days, tasks, deadlines, requestsAndCerts, overdue };
  }, [items, todayInfo.iso]);

  const kindCounts = useMemo(() => {
    const map = { all: items.length, deadline: 0, task: 0, request: 0, certificate: 0 };
    for (const item of items) map[item.kind] += 1;
    return map;
  }, [items]);

  const visible = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
    const monthPrefix = `${month.year}-${String(month.month).padStart(2, '0')}`;
    return items.filter(item => {
      if (selectedDate && item.date !== selectedDate) return false;
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (projectFilter !== 'all' && item.processId !== projectFilter) return false;
      if (horizonFilter === 'upcoming' && diffDaysFrom(todayInfo.iso, item.date) < 0) return false;
      if (horizonFilter === 'overdue' && diffDaysFrom(todayInfo.iso, item.date) >= 0) return false;
      if (horizonFilter === 'month' && !item.date.startsWith(monthPrefix)) return false;
      if (normalizedSearch) {
        const haystack = `${item.title} ${item.processTitle || ''}`.toLocaleLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }
      return true;
    });
  }, [items, selectedDate, kindFilter, projectFilter, horizonFilter, searchQuery, month, todayInfo.iso]);

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyActionId) return;
    const schema = z.object({
      projectId: z.string().min(1, en ? 'Select a project.' : 'Selecciona un proyecto.'),
      title: z
        .string()
        .trim()
        .min(2, en ? 'Enter at least 2 characters.' : 'Ingresa al menos 2 caracteres.')
        .max(200, en ? 'Maximum 200 characters.' : 'Máximo 200 caracteres.'),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, en ? 'Select a valid due date.' : 'Selecciona una fecha límite válida.'),
    });
    const parsed = schema.safeParse({ projectId: taskProjectId, title: taskTitle, dueDate: taskDueDate });
    if (!parsed.success) {
      const next: { projectId?: string; title?: string; dueDate?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as 'projectId' | 'title' | 'dueDate' | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setTaskErrors(next);
      return;
    }
    setTaskErrors({});
    setBusyActionId('create-task');
    try {
      await request(`/api/projects/${encodeURIComponent(parsed.data.projectId)}/workflow/tasks`, {
        method: 'POST',
        json: { title: parsed.data.title, dueDate: parsed.data.dueDate },
      });
      setTaskTitle('');
      setShowNewTask(false);
      const [y, m] = parsed.data.dueDate.split('-').map(Number);
      if (y && m) setMonth({ year: y, month: m });
      setRefresh(value => value + 1);
      showToast(en ? 'Task added to agenda.' : 'Tarea agregada a la agenda.', 'success');
    } catch {
      showToast(en ? 'Could not create the task.' : 'No se pudo crear la tarea.', 'error');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleCompleteTask = async (item: Item) => {
    if (!item.processId || busyActionId) return;
    const rawId = item.id.replace(/^task:/, '');
    setBusyActionId(item.id);
    try {
      const data = await request<{ tasks: { id: string; version: number }[] }>(
        `/api/projects/${encodeURIComponent(item.processId)}/workflow/tasks`,
      );
      const target = data.tasks.find(t => t.id === rawId);
      if (!target) throw new Error('Task not found');
      await request(
        `/api/projects/${encodeURIComponent(item.processId)}/workflow/tasks/${encodeURIComponent(rawId)}`,
        { method: 'PATCH', json: { completed: true, version: target.version } },
      );
      setRefresh(value => value + 1);
      showToast(en ? 'Task marked as completed.' : 'Tarea marcada como completada.', 'success');
    } catch {
      showToast(en ? 'Could not complete the task.' : 'No se pudo completar la tarea.', 'error');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleResolveRequest = async (item: Item) => {
    if (!item.processId || busyActionId) return;
    const rawId = item.id.replace(/^request:/, '');
    setBusyActionId(item.id);
    try {
      const data = await request<{ requests: { id: string; version: number }[] }>(
        `/api/projects/${encodeURIComponent(item.processId)}/submission-tracking`,
      );
      const target = data.requests.find(r => r.id === rawId);
      if (!target) throw new Error('Request not found');
      await request(
        `/api/projects/${encodeURIComponent(item.processId)}/submission-tracking/requests/${encodeURIComponent(rawId)}`,
        { method: 'PATCH', json: { status: 'resolved', version: target.version } },
      );
      setRefresh(value => value + 1);
      showToast(en ? 'Request marked as resolved.' : 'Solicitud marcada como resuelta.', 'success');
    } catch {
      showToast(en ? 'Could not resolve the request.' : 'No se pudo resolver la solicitud.', 'error');
    } finally {
      setBusyActionId(null);
    }
  };

  const jumpToDate = (dateIso: string) => {
    const [y, m] = dateIso.split('-').map(Number);
    if (y && m) setMonth({ year: y, month: m });
    setSelectedDate(current => (current === dateIso ? null : dateIso));
  };

  const resetFilters = () => {
    setSelectedDate(null);
    setKindFilter('all');
    setHorizonFilter('all');
    setProjectFilter('all');
    setSearchQuery('');
  };

  const hasActiveFilters =
    !!selectedDate || kindFilter !== 'all' || horizonFilter !== 'all' || projectFilter !== 'all' || !!searchQuery.trim();

  return (
    <section className="web-agenda">
      <header className="web-agenda-header">
        <div>
          <h2>{en ? 'Deadlines & Tasks Agenda' : 'Agenda de cierres y tareas'}</h2>
          <p>
            {en
              ? 'Pending tasks, submission requests, expiring certificates and saved tender deadlines across your projects.'
              : 'Tareas pendientes, solicitudes de presentación, vencimiento de certificados y cierres de licitaciones guardadas en tus proyectos.'}
          </p>
        </div>
        <div className="web-agenda-header-actions">
          {editingWidgets?<><Button size="sm" variant="ghost" disabled={widgetsSaving} onClick={()=>{setWidgetDraft(widgetOrder);setEditingWidgets(false);}}>{en?'Cancel':'Cancelar'}</Button><Button size="sm" disabled={widgetsSaving} onClick={()=>void saveWidgets()}>{en?'Save layout':'Guardar organización'}</Button></>:<Button icon={GripVertical} variant="outline" size="sm" disabled={!widgetsReady} onClick={()=>setEditingWidgets(true)}>{en?'Organize':'Organizar'}</Button>}
          {projectOptions.length > 0 && (
            <Button
              icon={Plus}
              variant={showNewTask ? 'default' : 'outline'}
              size="sm"
              type="button"
              onClick={() => setShowNewTask(value => !value)}
            >
              {en ? 'New task' : 'Nueva tarea'}
            </Button>
          )}
          {remindersSlot && (
            <Button
              icon={Bell}
              iconOnly
              variant={showNotifications ? 'default' : 'outline'}
              size="sm"
              type="button"
              onClick={() => setShowNotifications(value => !value)}
            >
              {en ? 'Notifications' : 'Notificaciones'}
            </Button>
          )}
          <Button
            icon={RefreshCw}
            iconOnly
            variant="outline"
            size="sm"
            type="button"
            disabled={loading}
            onClick={() => setRefresh(value => value + 1)}
          >
            {en ? 'Refresh' : 'Actualizar'}
          </Button>
        </div>
      </header>

      {showNotifications && remindersSlot && (
        <div className="web-agenda-notifications-drawer">{remindersSlot}</div>
      )}

      <Sheet
        open={showNewTask && projectOptions.length > 0}
        onOpenChange={open => {
          if (busyActionId !== 'create-task') {
            setShowNewTask(open);
            if (!open) setTaskErrors({});
          }
        }}
      >
        <SheetContent side="right" className="web-admin-sheet">
          <SheetHeader>
            <SheetTitle>{en ? 'New personal task' : 'Nueva tarea personal'}</SheetTitle>
            <SheetDescription>
              {en ? 'Add a reminder or follow-up task linked to one of your projects.' : 'Agrega un recordatorio o tarea de seguimiento vinculada a uno de tus proyectos.'}
            </SheetDescription>
          </SheetHeader>
          <form className="web-admin-sheet-form" onSubmit={handleCreateTask} noValidate>
            <div className="web-admin-sheet-field">
              <span>{en ? 'Project' : 'Proyecto'}</span>
              <SelectField
                aria-label={en ? 'Project' : 'Proyecto'}
                value={taskProjectId}
                disabled={busyActionId === 'create-task'}
                options={projectOptions.map(proj => ({ value: proj.id, label: proj.title }))}
                onChange={next => {
                  setTaskProjectId(next);
                  if (taskErrors.projectId) setTaskErrors(current => ({ ...current, projectId: undefined }));
                }}
              />
              {taskErrors.projectId && <p className="web-admin-field-error" role="alert">{taskErrors.projectId}</p>}
            </div>
            <label className="web-admin-sheet-field">
              <span>{en ? 'Task description' : 'Descripción de la tarea'}</span>
              <Input
                value={taskTitle}
                disabled={busyActionId === 'create-task'}
                onChange={e => {
                  setTaskTitle(e.target.value);
                  if (taskErrors.title) setTaskErrors(current => ({ ...current, title: undefined }));
                }}
                placeholder={en ? 'E.g., Request bid bond from insurer…' : 'Ej. Solicitar póliza de seriedad a la aseguradora…'}
                maxLength={200}
              />
              {taskErrors.title && <p className="web-admin-field-error" role="alert">{taskErrors.title}</p>}
            </label>
            <label className="web-admin-sheet-field">
              <span>{en ? 'Due date' : 'Fecha límite'}</span>
              <Input
                type="date"
                value={taskDueDate}
                disabled={busyActionId === 'create-task'}
                onChange={e => {
                  setTaskDueDate(e.target.value);
                  if (taskErrors.dueDate) setTaskErrors(current => ({ ...current, dueDate: undefined }));
                }}
              />
              {taskErrors.dueDate && <p className="web-admin-field-error" role="alert">{taskErrors.dueDate}</p>}
            </label>
            <div className="web-admin-sheet-actions">
              <Button variant="outline" type="button" disabled={busyActionId === 'create-task'} onClick={() => setShowNewTask(false)}>
                {en ? 'Cancel' : 'Cancelar'}
              </Button>
              <Button icon={Plus} type="submit" disabled={busyActionId === 'create-task'}>
                {busyActionId === 'create-task' ? (en ? 'Saving…' : 'Guardando…') : en ? 'Save task' : 'Guardar tarea'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {!loading && !error && <div className="web-agenda-stats web-agenda-widget" {...widgetAttrs('summary')} role="region" aria-label={en ? 'Agenda summary' : 'Resumen de la agenda'}>{widgetControls('summary')}
        <button
          type="button"
          className={`web-agenda-stat-card${horizonFilter === 'upcoming' && kindFilter === 'all' ? ' is-active' : ''}`}
          onClick={() => {
            setKindFilter('all');
            setHorizonFilter(current => (current === 'upcoming' ? 'all' : 'upcoming'));
          }}
        >
          <span className="web-agenda-stat-label">
            <Clock size={15} aria-hidden="true" />
            {en ? 'Next 7 days' : 'Próximos 7 días'}
          </span>
          <strong className="web-agenda-stat-value">{stats.next7Days}</strong>
          <small>{en ? 'Upcoming events' : 'Eventos cercanos'}</small>
        </button>

        <button
          type="button"
          className={`web-agenda-stat-card${kindFilter === 'deadline' ? ' is-active' : ''}`}
          onClick={() => setKindFilter(current => (current === 'deadline' ? 'all' : 'deadline'))}
        >
          <span className="web-agenda-stat-label">
            <CalendarDays size={15} aria-hidden="true" />
            {en ? 'Tender deadlines' : 'Cierres de licitación'}
          </span>
          <strong className="web-agenda-stat-value">{stats.deadlines}</strong>
          <small>{en ? 'Saved processes' : 'Procesos guardados'}</small>
        </button>

        <button
          type="button"
          className={`web-agenda-stat-card${kindFilter === 'task' ? ' is-active' : ''}`}
          onClick={() => setKindFilter(current => (current === 'task' ? 'all' : 'task'))}
        >
          <span className="web-agenda-stat-label">
            <ListTodo size={15} aria-hidden="true" />
            {en ? 'Pending tasks' : 'Tareas pendientes'}
          </span>
          <strong className="web-agenda-stat-value">{stats.tasks}</strong>
          <small>{en ? 'Personal checklist' : 'Lista personal'}</small>
        </button>

        <button
          type="button"
          className={`web-agenda-stat-card${kindFilter === 'request' || kindFilter === 'certificate' ? ' is-active' : ''}`}
          onClick={() => setKindFilter(current => (current === 'request' ? 'certificate' : current === 'certificate' ? 'all' : 'request'))}
        >
          <span className="web-agenda-stat-label">
            <FileCheck2 size={15} aria-hidden="true" />
            {en ? 'Requests & certificates' : 'Solicitudes y certificados'}
          </span>
          <strong className="web-agenda-stat-value">{stats.requestsAndCerts}</strong>
          <small>
            {stats.overdue > 0
              ? en
                ? `${stats.overdue} past dates in total`
                : `${stats.overdue} fechas pasadas en total`
              : en
                ? 'Clarifications & expirations'
                : 'Subsanaciones y vigencias'}
          </small>
        </button>
      </div>}

      {loading && <WebLoading message={en?'Loading agenda…':'Cargando agenda…'}/>}
      {error && <p role="alert">{en ? 'Could not load the agenda. Try refreshing.' : 'No se pudo cargar la agenda. Intenta actualizar.'}</p>}

      {!loading && !error && (
        <div className="web-agenda-layout">
          <aside className="web-agenda-sidebar web-agenda-widget" {...widgetAttrs('calendar')}>{widgetControls('calendar')}
            <AgendaCalendarView
              language={language}
              year={month.year}
              month={month.month}
              selected={selectedDate}
              today={todayInfo.iso}
              counts={counts}
              onShift={delta => {
                setMonth(current => shiftMonth(current.year, current.month, delta));
                setSelectedDate(null);
              }}
              onSelect={date => setSelectedDate(current => (current === date ? null : date))}
              onClear={() => setSelectedDate(null)}
              onToday={() => {
                setMonth({ year: todayInfo.year, month: todayInfo.month });
                setSelectedDate(todayInfo.iso);
              }}
            />
            <p className="web-notice web-agenda-notice">
              <ShieldAlert size={15} aria-hidden="true" />
              <span>
                {en
                  ? 'Personal dates are not the official schedule. Verify deadlines in SECOP.'
                  : 'Las fechas personales no son el cronograma oficial. Verifica los cierres en SECOP.'}
              </span>
            </p>
          </aside>

          <div className="web-agenda-main web-agenda-widget" {...widgetAttrs('events')}>{widgetControls('events')}
            <div className="web-agenda-toolbar">
              <div className="web-agenda-tabs" role="tablist" aria-label={en ? 'Filter by event type' : 'Filtrar por tipo de evento'}>
                {(
                  [
                    { id: 'all', label: en ? 'All' : 'Todos', count: kindCounts.all },
                    { id: 'deadline', label: en ? 'Deadlines' : 'Cierres', count: kindCounts.deadline },
                    { id: 'task', label: en ? 'Tasks' : 'Tareas', count: kindCounts.task },
                    { id: 'request', label: en ? 'Requests' : 'Solicitudes', count: kindCounts.request },
                    { id: 'certificate', label: en ? 'Certificates' : 'Certificados', count: kindCounts.certificate },
                  ] as const
                ).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={kindFilter === tab.id}
                    className={`web-agenda-tab${kindFilter === tab.id ? ' is-active' : ''}`}
                    onClick={() => setKindFilter(tab.id)}
                  >
                    <span>{tab.label}</span>
                    <small>{tab.count}</small>
                  </button>
                ))}
              </div>

              <div className="web-agenda-filters">
                <div className="web-agenda-search">
                  <Search size={15} aria-hidden="true" />
                  <Input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={en ? 'Search event or project…' : 'Buscar evento o proyecto…'}
                    aria-label={en ? 'Search event or project' : 'Buscar evento o proyecto'}
                  />
                </div>

                <SelectField
                  value={horizonFilter}
                  onChange={value => setHorizonFilter(value as HorizonFilter)}
                  fullWidth={false}
                  align="end"
                  aria-label={en ? 'Time horizon' : 'Horizonte de tiempo'}
                  options={[
                    { value: 'all', label: en ? 'All dates' : 'Todas las fechas' },
                    { value: 'upcoming', label: en ? 'Upcoming & today' : 'Próximos y hoy' },
                    { value: 'month', label: en ? 'Selected calendar month' : 'Mes visible en calendario' },
                    { value: 'overdue', label: en ? 'Past / Overdue' : 'Fechas pasadas / vencidas' },
                  ]}
                />

                {projectOptions.length > 0 && (
                  <SelectField
                    value={projectFilter}
                    onChange={setProjectFilter}
                    fullWidth={false}
                    align="end"
                    aria-label={en ? 'Filter by project' : 'Filtrar por proyecto'}
                    options={[
                      { value: 'all', label: en ? 'All projects' : 'Todos los proyectos' },
                      ...projectOptions.map(proj => ({ value: proj.id, label: proj.title })),
                    ]}
                  />
                )}

                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" type="button" onClick={resetFilters}>
                    {en ? 'Clear filters' : 'Limpiar filtros'}
                  </Button>
                )}
              </div>
            </div>

            {!items.length && (
              <div className="web-agenda-empty">
                <CalendarDays size={28} aria-hidden="true" />
                <strong>{en ? 'No dates recorded yet.' : 'Aún no hay fechas registradas.'}</strong>
                <p>
                  {en
                    ? 'Save a tender from SECOP, add personal tasks to your projects or register company certificates to see their deadlines here.'
                    : 'Guarda una licitación desde SECOP, agrega tareas personales en tus proyectos o registra certificados de empresa para ver sus vencimientos aquí.'}
                </p>
              </div>
            )}

            {!!items.length && !visible.length && (
              <div className="web-agenda-empty">
                <CalendarDays size={24} aria-hidden="true" />
                <p>
                  {selectedDate
                    ? en
                      ? 'No events on this date.'
                      : 'No hay eventos en esta fecha.'
                    : en
                      ? 'No events match the selected filters.'
                      : 'No hay eventos que coincidan con los filtros seleccionados.'}
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" type="button" onClick={resetFilters}>
                    {en ? 'Show all events' : 'Mostrar todos los eventos'}
                  </Button>
                )}
              </div>
            )}

            {!!visible.length && (
              <div className="web-agenda-list">
                {visible.map(item => {
                  const Icon = item.kind === 'task' ? ListTodo : item.kind === 'certificate' ? FileCheck2 : CalendarDays;
                  const diff = diffDaysFrom(todayInfo.iso, item.date);
                  const relativeLabel =
                    diff === 0
                      ? en
                        ? 'Today'
                        : 'Hoy'
                      : diff === 1
                        ? en
                          ? 'Tomorrow'
                          : 'Mañana'
                        : diff > 1
                          ? en
                            ? `In ${diff} d`
                            : `En ${diff} d`
                          : diff === -1
                            ? en
                              ? 'Yesterday'
                              : 'Ayer'
                            : en
                              ? `${Math.abs(diff)} d ago`
                              : `Hace ${Math.abs(diff)} d`;
                  const urgencyState = diff < 0 ? 'overdue' : diff <= 3 ? 'urgent' : diff <= 7 ? 'soon' : 'normal';
                  const kindLabel =
                    item.kind === 'task'
                      ? en
                        ? 'Personal task'
                        : 'Tarea personal'
                      : item.kind === 'request'
                        ? en
                          ? 'Submission request'
                          : 'Solicitud de presentación'
                        : item.kind === 'certificate'
                          ? en
                            ? 'Certificate expires'
                            : 'Vence certificado'
                          : item.deadlineVerified
                            ? en
                              ? 'Published deadline'
                              : 'Cierre publicado'
                            : en
                              ? 'Date to verify in SECOP'
                              : 'Fecha por verificar en SECOP';

                  return (
                    <article key={item.id} className="web-agenda-item" data-kind={item.kind} data-urgency={urgencyState}>
                      <button
                        type="button"
                        className="web-agenda-item-date"
                        onClick={() => jumpToDate(item.date)}
                        title={en ? 'Show date in calendar' : 'Ver fecha en el calendario'}
                      >
                        <time dateTime={item.date}>{item.date.split('-').reverse().join('/')}</time>
                        <span className={`web-agenda-urgency is-${urgencyState}`}>{relativeLabel}</span>
                      </button>

                      <div className="web-agenda-item-body">
                        <div className="web-agenda-item-badges">
                          <span className={`web-agenda-kind-badge is-${item.kind}`}>
                            <Icon aria-hidden="true" size={13} />
                            {kindLabel}
                          </span>
                          {item.processTitle && (
                            <span className="web-agenda-project-name" title={item.processTitle}>
                              {item.processTitle}
                            </span>
                          )}
                        </div>
                        <strong className="web-agenda-item-title">{item.title}</strong>
                        {item.kind === 'deadline' && (
                          <p className="web-agenda-item-meta">
                            {item.deadlineSource === 'watch'
                              ? en
                                ? 'Last observed by monitoring'
                                : 'Último valor observado en seguimiento'
                              : en
                                ? 'Saved tender'
                                : 'Licitación guardada'}
                            {item.checkedAt &&
                              ` · ${en ? 'Last attempt' : 'Último intento'}: ${new Intl.DateTimeFormat(en ? 'en-GB' : 'es-CO', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              }).format(new Date(item.checkedAt))}`}
                            {item.watchError && ` · ${en ? 'Last check had issues' : 'La última revisión tuvo problemas'}`}
                          </p>
                        )}
                      </div>

                      <div className="web-agenda-item-actions">
                        {item.kind === 'task' && item.processId && (
                          <>
                            <Button
                              icon={CheckCircle2}
                              variant="outline"
                              size="sm"
                              type="button"
                              disabled={busyActionId === item.id}
                              onClick={() => void handleCompleteTask(item)}
                            >
                              {en ? 'Complete' : 'Completar'}
                            </Button>
                            <Button
                              icon={FolderOpen}
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => onOpenProject(item.processId!, 'tracking', 'prepare')}
                            >
                              {en ? 'Open tasks' : 'Abrir tareas'}
                            </Button>
                          </>
                        )}

                        {item.kind === 'request' && item.processId && (
                          <>
                            <Button
                              icon={CheckCircle2}
                              variant="outline"
                              size="sm"
                              type="button"
                              disabled={busyActionId === item.id}
                              onClick={() => void handleResolveRequest(item)}
                            >
                              {en ? 'Resolve' : 'Resolver'}
                            </Button>
                            <Button
                              icon={FolderOpen}
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => onOpenProject(item.processId!, 'tracking', 'after')}
                            >
                              {en ? 'Open tracking' : 'Abrir seguimiento'}
                            </Button>
                          </>
                        )}

                        {item.kind === 'deadline' && item.processId && (
                          <>
                            <Button
                              icon={PenLine}
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => onOpenProject(item.processId!, 'prepare')}
                            >
                              {en ? 'Draft offer' : 'Redactar oferta'}
                            </Button>
                            <Button
                              icon={FolderOpen}
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => onOpenProject(item.processId!, 'documents')}
                            >
                              {en ? 'Open project' : 'Abrir proyecto'}
                            </Button>
                          </>
                        )}

                        {!item.processId && (
                          <Button icon={FolderOpen} variant="outline" size="sm" type="button" onClick={() => onOpenCertificates()}>
                            {en ? 'Open certificates' : 'Abrir certificados'}
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
