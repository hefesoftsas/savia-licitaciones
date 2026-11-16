import { useEffect, useId, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '../../shared/ui/primitives/button';
import { Checkbox } from '../../shared/ui/primitives/checkbox';
import { Input } from '../../shared/ui/primitives/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../shared/ui/primitives/popover';
import { request } from './api.mjs';
import { categoryCache } from './secop-category-cache.mjs';
import { localizeRuntimeText } from '../../shared/i18n/localizeRuntimeText';
import type { SecopCategory, SecopDataset } from '../../shared/types/secop';

const copy = {
  es: { all: 'Todas', filter: 'Filtrar categorías…', loading: 'Cargando categorías…', error: 'No se pudieron cargar las categorías.', retry: 'Reintentar', empty: 'No hay categorías que coincidan.', clear: 'Limpiar selección', remove: 'Quitar', selected: 'seleccionadas' },
  en: { all: 'All', filter: 'Filter categories…', loading: 'Loading categories…', error: 'Could not load categories.', retry: 'Retry', empty: 'No matching categories.', clear: 'Clear selection', remove: 'Remove', selected: 'selected' },
};

export function WebCategoryFilter({ label, category, dataset, value, onChange, language }: {
  label: string; category: SecopCategory; dataset: SecopDataset; value: string[]; onChange: (value: string[]) => void; language: 'es' | 'en';
}) {
  const s = copy[language === 'es' ? 'es' : 'en'];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<string[] | null>(() => categoryCache.peek(dataset, category));
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    const cached = categoryCache.peek(dataset, category);
    if (cached !== null) { setOptions(cached); setLoading(false); setFailed(false); return; }
    let active = true;
    setOptions(null); setLoading(true); setFailed(false); setErrorDetail('');
    categoryCache.load(dataset, category, request).then(data => {
      if (active) setOptions(data);
    }).catch(error => { if (active) { setFailed(true); setErrorDetail(error instanceof Error ? error.message : ''); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, dataset, category, attempt]);

  const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
  const visible = (options || []).filter(option => normalize(option).includes(normalize(query)));
  const toggle = (option: string) => onChange(value.includes(option) ? value.filter(item => item !== option) : [...value, option]);

  return <div className="secop-field secop-category" data-category={category} data-help-description={language === 'en' ? `Choose one or more ${label.toLowerCase()} options to narrow the search.` : `Elige una o varias opciones de ${label.toLowerCase()} para acotar la búsqueda.`}>
    <span id={`${id}-label`}>{label}</span>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="secop-category-trigger" aria-labelledby={`${id}-label ${id}-value`}>
          <span id={`${id}-value`}>{value.length ? `${value.length} ${language === 'es' && value.length === 1 ? 'seleccionada' : s.selected}` : s.all}</span><ChevronDown size={14} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="secop-category-popover" aria-label={label}>
        <Input aria-label={`${s.filter} ${label}`} placeholder={s.filter} value={query} onChange={event => setQuery(event.target.value)} />
        <div className="secop-category-options" role="group" aria-label={label}>
          {loading ? <p role="status">{s.loading}</p> : failed ? <div role="alert"><p>{s.error}</p>{errorDetail && <p>{localizeRuntimeText(errorDetail, language)}</p>}<Button type="button" variant="outline" onClick={() => setAttempt(n => n + 1)}>{s.retry}</Button></div> : !visible.length ? <p role="status">{s.empty}</p> : visible.map(option => <label className="secop-category-option" key={option}>
            <Checkbox checked={value.includes(option)} onCheckedChange={() => toggle(option)} /><span>{option}</span>
          </label>)}
        </div>
        <Button type="button" variant="ghost" disabled={!value.length} onClick={() => onChange([])}>{s.clear}</Button>
      </PopoverContent>
    </Popover>
    {value.length > 0 && <div className="secop-category-tags" aria-label={`${label}: ${s.selected}`}>
      {value.map(option => <Button type="button" key={option} variant="secondary" size="sm" onClick={() => toggle(option)} aria-label={`${s.remove} ${option}`}>
        <span>{option}</span><X size={12} aria-hidden="true" />
      </Button>)}
    </div>}
  </div>;
}
