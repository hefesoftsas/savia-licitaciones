import {Save} from 'lucide-react';
import { useEffect, useState } from 'react';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { useToast } from '@/shared/ui/ToastProvider';
import { compareRupNumber, requiresRupInterpretation } from './secop/rupComparison.mjs';
import { parseTenderRule } from './secop/tenderRuleSuggestions.mjs';
import { request } from './api.mjs';

type Fact = { id: string; label: string; value: string; page: number; version: number };
type Comparison = { factId: string; certificateId: string; certificateName: string; issuedOn: string; label: string; value: string; interpretedValue: string; page: number; title: string; source: string; operator: 'gte' | 'lte'; threshold: string; version: number; stale: boolean };
export default function WebRupComparison({ projectId, requirementId, requirementVersion, requirementDirty, title, source, language, onDirty }: { projectId: string; requirementId: string; requirementVersion: number; requirementDirty: boolean; title: string; source: string; language: 'es' | 'en'; onDirty: (id: string, value: boolean) => void }) {
  const en = language === 'en', { showToast } = useToast(), rule = parseTenderRule(title);
  const [opened, setOpened] = useState(false), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [facts, setFacts] = useState<Fact[]>([]), [certificateVersion, setCertificateVersion] = useState(0), [saved, setSaved] = useState<Comparison | null>(null);
  const [selected, setSelected] = useState(''), [operator, setOperator] = useState<'gte' | 'lte'>(rule?.operator || 'gte'), [threshold, setThreshold] = useState(rule?.threshold || ''), [interpretedValue, setInterpretedValue] = useState('');
  const fact = facts.find(item => item.id === selected), ambiguous = Boolean(fact && requiresRupInterpretation(fact.value));
  const dirty = Boolean(selected || interpretedValue || threshold !== (rule?.threshold || '') || operator !== (rule?.operator || 'gte'));
  useEffect(() => { onDirty(`comparison:${requirementId}`, dirty); return () => onDirty(`comparison:${requirementId}`, false); }, [dirty, requirementId, onDirty]);
  useEffect(() => { setThreshold(rule?.threshold || ''); setOperator(rule?.operator || 'gte'); }, [title]);
  useEffect(() => {
    if (!opened) return;
    let active = true; setBusy(true); setFailed(false);
    void Promise.all([request<{ facts: Fact[]; version: number }>('/api/rup/facts'), request<{ comparison: Comparison | null }>(`/api/projects/${projectId}/workflow/requirements/${requirementId}/rup-comparison`)])
      .then(([data, comparison]) => { if (active) { setFacts(data.facts); setCertificateVersion(data.version); setSaved(comparison.comparison); setLoaded(true); } })
      .catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [opened, projectId, requirementId, requirementVersion]);
  const result = fact ? compareRupNumber(ambiguous ? interpretedValue : fact.value, threshold, operator, ambiguous && Boolean(interpretedValue)) : 'unknown';
  const savedResult = saved ? compareRupNumber(saved.interpretedValue || saved.value, saved.threshold, saved.operator, Boolean(saved.interpretedValue)) : 'unknown';
  const describe = (value: string) => value === 'meets' ? (en ? 'The value satisfies the recorded numeric rule.' : 'El valor satisface la regla numérica registrada.') : value === 'does_not_meet' ? (en ? 'The value does not satisfy the recorded numeric rule.' : 'El valor no satisface la regla numérica registrada.') : (en ? 'The value needs manual review.' : 'El valor requiere revisión manual.');
  const save = async () => {
    if (!fact || requirementDirty) return; setBusy(true);
    try {
      const data = await request<{ comparison: Comparison | null }>(`/api/projects/${projectId}/workflow/requirements/${requirementId}/rup-comparison`, { method: 'PUT', json: { factId: fact.id, factVersion: fact.version, certificateVersion, requirementVersion, version: saved?.version || 0, operator, threshold, interpretedValue } });
      setSaved(data.comparison); setSelected(''); setInterpretedValue(''); setThreshold(rule?.threshold || ''); setOperator(rule?.operator || 'gte'); showToast(en ? 'Comparison saved.' : 'Comparación guardada.', 'success');
    } catch (error) {
      const conflict = (error as Error & { status?: number }).status === 409;
      showToast(conflict ? (en ? 'The sources changed. Copy your edits, close and reopen the comparison.' : 'Las fuentes cambiaron. Copia tus cambios, cierra y vuelve a abrir la comparación.') : (en ? 'Could not save the comparison.' : 'No se pudo guardar la comparación.'), 'error');
    } finally { setBusy(false); }
  };
  return <details onToggle={event => setOpened(event.currentTarget.open)}><summary>{en ? 'Compare reviewed accreditation data (RUP / ROLECE)' : 'Comparar dato revisado (RUP / ROLECE)'}</summary>
    {busy && !loaded && <p role="status">{en ? 'Loading…' : 'Cargando…'}</p>}{failed && <p role="alert">{en ? 'Could not load the accreditation data. Close and reopen to retry.' : 'No se pudieron cargar los datos de acreditación. Cierra y vuelve a abrir para reintentar.'}</p>}
    {saved && <section><strong>{en ? 'Saved comparison' : 'Comparación guardada'}</strong>{saved.stale && <p role="status">{en ? 'A source changed. Review this comparison before using it.' : 'Una fuente cambió. Revisa esta comparación antes de usarla.'}</p>}
      <p>{saved.label}: {saved.value} · {saved.certificateName} · {en ? 'PDF page' : 'página del PDF'} {saved.page}{saved.issuedOn && ` · ${en ? 'issued' : 'expedido'} ${saved.issuedOn}`}</p>{saved.interpretedValue && <p>{en ? 'Value interpreted by you' : 'Valor interpretado por ti'}: {saved.interpretedValue}</p>}<p>{saved.title} · {saved.source} · {saved.operator === 'gte' ? '≥' : '≤'} {saved.threshold}</p><p>{describe(savedResult)}</p><a href={`/api/rup/certificates/${encodeURIComponent(saved.certificateId)}/pdf#page=${saved.page}`} target="_blank" rel="noopener noreferrer">{en ? 'Open saved certificate source' : 'Abrir certificado guardado'}</a>
    </section>}
    {loaded && !facts.length ? <p>{en ? 'First add reviewed data under Company.' : 'Primero agrega datos revisados en Empresa.'}</p> : loaded && <><p>{en ? 'Use the same units and no thousands separators. Verify both sources; this does not decide eligibility.' : 'Usa las mismas unidades y no uses separadores de miles. Verifica ambas fuentes; esto no decide la habilitación.'}</p>{rule && <p>{en ? 'Suggested rule from the requirement; verify it against the source.' : 'Regla sugerida del requisito; verifícala en la fuente.'}</p>}
      <label>{en ? 'Accreditation data' : 'Dato de acreditación'}<select value={selected} disabled={busy || failed} onChange={event => { setSelected(event.target.value); setInterpretedValue(''); }}><option value="">{en ? 'Choose data' : 'Seleccionar dato'}</option>{facts.map(item => <option key={item.id} value={item.id}>{item.label} · {item.value} · {en ? 'page' : 'página'} {item.page}</option>)}</select></label>
      <label>{en ? 'Rule' : 'Regla'}<select value={operator} disabled={busy || failed} onChange={event => setOperator(event.target.value as 'gte' | 'lte')}><option value="gte">{en ? 'At least' : 'Al menos'} (≥)</option><option value="lte">{en ? 'At most' : 'Como máximo'} (≤)</option></select></label>
      <label>{en ? 'Tender threshold' : 'Umbral del pliego'}<Input value={threshold} inputMode="decimal" maxLength={80} disabled={busy || failed} onChange={event => setThreshold(event.target.value)} /></label>{ambiguous && <label>{en ? 'Check the RUP and enter the value without thousands separators' : 'Revisa el RUP y escribe el valor sin separadores de miles'}<Input value={interpretedValue} inputMode="decimal" maxLength={80} disabled={busy || failed} onChange={event => setInterpretedValue(event.target.value)} /></label>}
      {fact && threshold && <p role="status">{describe(result)} {en ? 'Verify both sources and the tender conditions.' : 'Verifica ambas fuentes y las condiciones del pliego.'}</p>}{requirementDirty && <p>{en ? 'Save the requirement before saving the comparison.' : 'Guarda el requisito antes de guardar la comparación.'}</p>}{!source.trim() && <p>{en ? 'Save the tender source before comparing.' : 'Guarda la fuente del pliego antes de comparar.'}</p>}
      <Button icon={Save} type="button" size="sm" variant="outline" disabled={busy || failed || requirementDirty || !source.trim() || !fact || !/^[+-]?\d+(?:[.,]\d+)?$/.test(threshold.trim()) || (ambiguous && !/^[+-]?\d+(?:[.,]\d+)?$/.test(interpretedValue.trim()))} onClick={() => void save()}>{en ? 'Save comparison' : 'Guardar comparación'}</Button>
    </>}
  </details>;
}
