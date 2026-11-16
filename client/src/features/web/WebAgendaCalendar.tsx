import {ChevronLeft,ChevronRight} from 'lucide-react';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import {monthDays} from './agenda-calendar.mjs';

type Props={
  language:'es'|'en';
  year:number;
  month:number;
  selected:string|null;
  today?:string;
  counts:Record<string,number>;
  onShift:(delta:number)=>void;
  onSelect:(date:string)=>void;
  onClear:()=>void;
  onToday?:()=>void;
};

export function AgendaCalendarView({language,year,month,selected,today,counts,onShift,onSelect,onClear,onToday}:Props){
  const en=language==='en',weekdays=en?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  return (
    <section className="web-agenda-calendar" aria-label={en?'Monthly calendar':'Calendario mensual'}>
      <header>
        <Button icon={ChevronLeft} iconOnly variant="ghost" type="button" onClick={()=>onShift(-1)} aria-label={en?'Previous month':'Mes anterior'} />
        <h3>{new Intl.DateTimeFormat(en?'en':'es-CO',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)))}</h3>
        <div className="web-inline">
          {onToday && <Button variant="outline" size="sm" type="button" onClick={onToday}>{en?'Today':'Hoy'}</Button>}
          <Button icon={ChevronRight} iconOnly variant="ghost" type="button" onClick={()=>onShift(1)} aria-label={en?'Next month':'Mes siguiente'} />
        </div>
      </header>
      <div className="web-agenda-calendar-grid">
        {weekdays.map(day=><strong key={day}>{day}</strong>)}
        {monthDays(year,month).map((date,index)=>date?(
          <button
            type="button"
            key={date}
            aria-pressed={selected===date}
            data-today={today===date?'true':undefined}
            data-has-events={counts[date]?'true':undefined}
            aria-label={`${date}, ${counts[date]||0} ${en?'events':'eventos'}`}
            onClick={()=>onSelect(date)}
          >
            <span className="web-agenda-day-num">{Number(date.slice(-2))}</span>
            {!!counts[date]&&<small className="web-agenda-day-badge">{counts[date]}</small>}
          </button>
        ):(
          <span key={`blank-${index}`} className="web-agenda-day-blank"/>
        ))}
      </div>
      {selected&&(
        <div className="web-agenda-calendar-footer">
          <span>{en?`Selected date: ${selected.split('-').reverse().join('/')}`:`Fecha seleccionada: ${selected.split('-').reverse().join('/')}`}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>{en?'Show all dates':'Mostrar todas las fechas'}</Button>
        </div>
      )}
    </section>
  );
}
