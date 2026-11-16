import {WebLoading} from './WebLoading';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BarChart3,
  BookmarkCheck,
  BookmarkPlus,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  Filter,
  LayoutList,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Table2,
} from 'lucide-react';
import { ActionButton as Button } from '@/shared/ui/ActionButton';
import { Input } from '@/shared/ui/primitives/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/primitives/table';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/primitives/tabs';
import { useToast } from '@/shared/ui/ToastProvider';
import { request } from './api.mjs';
import WebPaaWatch, { type PaaState } from './WebPaaWatch';
import { WebProjectHelp } from './WebProjectHelp';

type Mode = 'paa' | 'history' | 'tvec';
type Query = { entity: string; keyword: string; supplier: string; year?: number };
type Item = {
  id: string;
  planId?: string;
  entity: string;
  description: string;
  value: number | null;
  year?: number | null;
  startDate?: string;
  offerDate?: string;
  classifications?: string;
  modality?: string;
  version?: string;
  versionDate?: string;
  supplier?: string;
  supplierId?: string;
  date?: string;
  status?: string;
};
type Summary = {
  records: number;
  contracts: number;
  values: number;
  from: string;
  to: string;
  minimum: number | null;
  maximum: number | null;
  average: number | null;
  checkedAt: string;
  sourceUrl: string;
};
type SortOption = 'default' | 'value-desc' | 'value-asc' | 'entity-asc';
type ViewLayout = 'cards' | 'table';

const datasets: Record<Mode, string> = {
  paa: 'https://www.datos.gov.co/Estad-sticas-Nacionales/SECOPII-Plan-Anual-De-Adquisiciones-Detalle/9sue-ezhx',
  history: 'https://www.datos.gov.co/Gastos-Gubernamentales/SECOP-II-Contratos/jbjy-vk9h',
  tvec: 'https://www.datos.gov.co/Gastos-Gubernamentales/Tienda-Virtual-del-Estado-Colombiano-Consolidado/rgxm-mmea',
};

function recordUrl(mode: Mode, id: string) {
  const field = mode === 'paa' ? 'id' : mode === 'tvec' ? 'identificador_de_la_orden' : 'id_contrato';
  const dataset = mode === 'paa' ? '9sue-ezhx' : mode === 'tvec' ? 'rgxm-mmea' : 'jbjy-vk9h';
  const params = new URLSearchParams({ $where: `${field}='${id.replace(/'/g, "''")}'` });
  return `https://www.datos.gov.co/resource/${dataset}.json?${params}`;
}

export default function WebMarket({ language }: { language: 'es' | 'en' }) {
  const en = language === 'en';
  const { showToast } = useToast();
  const currentYear = String(new Date().getFullYear());

  const [mode, setMode] = useState<Mode>('paa');
  const [entity, setEntity] = useState('');
  const [keyword, setKeyword] = useState('');
  const [supplier, setSupplier] = useState('');
  const [year, setYear] = useState(currentYear);

  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState<Query | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState('');

  const [showFilters, setShowFilters] = useState(true);
  const [showWatchedPlans, setShowWatchedPlans] = useState(false);
  const [pageSearch, setPageSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [viewLayout, setViewLayout] = useState<ViewLayout>('cards');

  const [watch, setWatch] = useState<PaaState | null>(null);
  const [watchError, setWatchError] = useState('');
  const [following, setFollowing] = useState('');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const refreshWatch = async () => {
    const state = await request<PaaState>('/api/paa-watches');
    setWatch(state);
    setWatchError('');
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const state = await request<PaaState>('/api/paa-watches');
        if (active) {
          setWatch(state);
          setWatchError('');
        }
      } catch {
        if (active) {
          setWatchError(language === 'en' ? 'Could not load followed plans.' : 'No se pudieron cargar los planes seguidos.');
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [language]);

  const follow = async (planId: string) => {
    setFollowing(planId);
    setWatchError('');
    try {
      await request('/api/paa-watches', { method: 'POST', json: { planId, language } });
      await refreshWatch();
      showToast(en ? 'Plan added to followed list.' : 'Plan agregado a la lista de seguimiento.', 'success');
    } catch {
      setWatchError(
        en
          ? 'Could not follow the plan. Verify its published version.'
          : 'No se pudo seguir el plan. Verifica su versión publicada.',
      );
    } finally {
      setFollowing('');
    }
  };

  const money = (value: number | null | undefined) =>
    value == null
      ? en
        ? 'Not reported'
        : 'No informado'
      : new Intl.NumberFormat(en ? 'en-US' : 'es-CO', { maximumFractionDigits: 2 }).format(value);

  const run = async (next: Query, nextOffset: number, nextMode: Mode = mode) => {
    setLoading(true);
    setError('');
    setSummary(null);
    setSummaryError('');
    try {
      const result = await request<{ data: { items: Item[]; hasMore: boolean } }>('/api/secop/market', {
        method: 'POST',
        json: { ...next, mode: nextMode, offset: nextOffset, language },
      });
      setItems(result.data.items);
      setHasMore(result.data.hasMore);
      setOffset(nextOffset);
      setQuery(next);
      setCheckedAt(new Date().toISOString());
      setSearched(true);
    } catch {
      setError(
        en
          ? 'Could not query the public data source. Try again.'
          : 'No se pudo consultar la fuente de datos pública. Inténtalo de nuevo.',
      );
      setItems([]);
      setHasMore(false);
      setQuery(null);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const buildQuery = (): Query => ({
    entity: entity.trim(),
    keyword: keyword.trim(),
    supplier: mode === 'paa' ? '' : supplier.trim(),
    ...(mode === 'paa' && year ? { year: Number(year) } : {}),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(buildQuery(), 0);
  };

  const resetForm = () => {
    setEntity('');
    setKeyword('');
    setSupplier('');
    setYear(currentYear);
    setPageSearch('');
    setSortBy('default');
    setItems([]);
    setQuery(null);
    setSearched(false);
    setHasMore(false);
    setOffset(0);
    setError('');
    setSummary(null);
    setSummaryError('');
    setCheckedAt('');
  };

  const changeMode = (value: Mode) => {
    setMode(value);
    setItems([]);
    setQuery(null);
    setSearched(false);
    setHasMore(false);
    setOffset(0);
    setError('');
    setSummary(null);
    setSummaryError('');
    setCheckedAt('');
    setPageSearch('');
    setSortBy('default');
  };

  const calculate = async () => {
    if (!query) return;
    setSummaryLoading(true);
    setSummaryError('');
    setSummary(null);
    try {
      const result = await request<{ data: Summary }>('/api/secop/market/summary', {
        method: 'POST',
        json: { ...query, language },
      });
      setSummary(result.data);
    } catch {
      setSummaryError(en ? 'Could not calculate the summary.' : 'No se pudo calcular el resumen.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const displayedItems = useMemo(() => {
    const q = pageSearch.trim().toLocaleLowerCase();
    const filtered = q
      ? items.filter(item =>
          [item.entity, item.description, item.supplier, item.id, item.classifications, item.modality]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase()
            .includes(q),
        )
      : [...items];

    if (sortBy === 'value-desc') {
      filtered.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    } else if (sortBy === 'value-asc') {
      filtered.sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
    } else if (sortBy === 'entity-asc') {
      filtered.sort((a, b) => (a.entity || '').localeCompare(b.entity || '', language));
    }
    return filtered;
  }, [items, pageSearch, sortBy, language]);

  const pageStats = useMemo(() => {
    const entities = new Set<string>();
    let totalValue = 0;
    let withValue = 0;
    for (const item of displayedItems) {
      if (item.entity) entities.add(item.entity);
      if (typeof item.value === 'number' && Number.isFinite(item.value)) {
        totalValue += item.value;
        withValue += 1;
      }
    }
    return {
      count: displayedItems.length,
      entities: entities.size,
      totalValue: withValue > 0 ? totalValue : null,
      avgValue: withValue > 0 ? totalValue / withValue : null,
    };
  }, [displayedItems]);

  const exportPage = async (format: 'csv' | 'xlsx') => {
    if (!displayedItems.length) return;
    try {
      const XLSX = await import('xlsx');
      const rows = displayedItems.map(item =>
        mode === 'paa'
          ? {
              [en ? 'ID' : 'ID']: item.id || '',
              [en ? 'Entity' : 'Entidad']: item.entity || '',
              [en ? 'Year' : 'Año']: item.year ?? '',
              [en ? 'Description' : 'Descripción']: item.description || '',
              [en ? 'Estimated value' : 'Valor estimado']: item.value ?? '',
              [en ? 'Expected start' : 'Inicio previsto']: item.startDate || '',
              [en ? 'Expected offers' : 'Ofertas previstas']: item.offerDate || '',
              UNSPSC: item.classifications || '',
              [en ? 'Modality' : 'Modalidad']: item.modality || '',
              [en ? 'Plan version' : 'Versión del plan']: item.version || '',
            }
          : {
              [en ? 'ID' : 'ID']: item.id || '',
              [en ? 'Entity' : 'Entidad']: item.entity || '',
              [en ? 'Supplier' : 'Proveedor']: item.supplier || '',
              [en ? 'Supplier ID' : 'Identificación']: item.supplierId || '',
              [en ? 'Description' : 'Descripción']: item.description || '',
              [en ? 'Value' : 'Valor']: item.value ?? '',
              [en ? 'Date' : 'Fecha']: item.date?.slice(0, 10) || '',
              ...(mode === 'tvec' ? { [en ? 'Status' : 'Estado']: item.status || '' } : {}),
            },
      );
      const sheet = XLSX.utils.json_to_sheet(rows);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, mode.toUpperCase());
      XLSX.writeFile(book, `inteligencia-mercado-${mode}.${format}`, { bookType: format });
    } catch {
      showToast(en ? 'Could not export results.' : 'No se pudieron exportar los resultados.', 'error');
    }
  };

  const quickPivotEntity = (entityName: string) => {
    if (!entityName) return;
    setEntity(entityName);
    const next: Query = {
      entity: entityName,
      keyword: keyword.trim(),
      supplier: mode === 'paa' ? '' : supplier.trim(),
      ...(mode === 'paa' && year ? { year: Number(year) } : {}),
    };
    void run(next, 0);
  };

  const quickPivotSupplier = (supplierName: string) => {
    if (!supplierName || mode === 'paa') return;
    setSupplier(supplierName);
    const next: Query = {
      entity: entity.trim(),
      keyword: keyword.trim(),
      supplier: supplierName,
    };
    void run(next, 0);
  };

  const modeHeading =
    mode === 'paa'
      ? {
          title: en ? 'Planned Purchases · Annual Procurement Plan (PAA)' : 'Compras planeadas · Plan Anual de Adquisiciones (PAA)',
          subtitle: en
            ? 'Explore acquisitions planned by public entities for the year and monitor plan version changes.'
            : 'Explora las adquisiciones planeadas por las entidades públicas y haz seguimiento a cambios de versión.',
        }
      : mode === 'history'
        ? {
            title: en ? 'SECOP II Contract History' : 'Histórico de contratos en SECOP II',
            subtitle: en
              ? 'Analyze signed contracts, awarded suppliers and historical value ranges across public entities.'
              : 'Analiza contratos firmados, proveedores adjudicados y rangos de valor histórico en entidades públicas.',
          }
        : {
            title: en ? 'Colombian State Virtual Store Orders (TVEC)' : 'Órdenes de la Tienda Virtual del Estado Colombiano',
            subtitle: en
              ? 'Review purchase orders issued under framework agreements and demand aggregation instruments.'
              : 'Consulta órdenes de compra emitidas mediante acuerdos marco e instrumentos de agregación de demanda.',
          };

  const hasWatchedItems = !!watch && (watch.items.length > 0 || watch.alerts.length > 0);

  return (
    <section className="web-market">
      <Tabs value={mode} onValueChange={v => !loading && !summaryLoading && changeMode(v as Mode)} className="web-opportunity-tabs">
        <TabsList aria-label={en ? 'Data source' : 'Fuente de datos'}>
          <TabsTrigger value="paa" data-market-tab="paa" disabled={loading || summaryLoading}>
            {en ? 'Planned purchases · PAA' : 'Compras planeadas · PAA'}
          </TabsTrigger>
          <TabsTrigger value="history" data-market-tab="history" disabled={loading || summaryLoading}>
            {en ? 'Contract history' : 'Histórico de contratos'}
          </TabsTrigger>
          <TabsTrigger value="tvec" data-market-tab="tvec" disabled={loading || summaryLoading}>
            {en ? 'Virtual store orders' : 'Órdenes · Tienda Virtual'}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="web-secop-heading web-market-heading">
        <div>
          <h2>{modeHeading.title}</h2>
          <p>{modeHeading.subtitle}</p>
        </div>
        <div className="web-inline">
          {mode === 'paa' && (
            <Button
              icon={BookmarkCheck}
              variant={showWatchedPlans || hasWatchedItems ? 'default' : 'outline'}
              size="sm"
              type="button"
              onClick={() => setShowWatchedPlans(v => !v)}
            >
              {en ? 'Followed plans' : 'Planes seguidos'}
              {watch ? ` (${watch.items.length})` : ''}
              {watch && watch.unreadCount > 0 ? ` · ${watch.unreadCount}` : ''}
            </Button>
          )}
          <a href={datasets[mode]} target="_blank" rel="noreferrer" className="web-market-source-link">
            <span>{en ? 'Official data source' : 'Ver fuente oficial'}</span>
            <ExternalLink size={14} aria-hidden="true" />
          </a>
          <Button
            icon={SlidersHorizontal}
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setShowFilters(v => !v)}
            aria-expanded={showFilters}
          >
            {showFilters ? (en ? 'Hide filters' : 'Ocultar filtros') : (en ? 'Show filters' : 'Mostrar filtros')}
          </Button>
          <WebProjectHelp language={language} area="market" step={mode === 'paa' ? 0 : mode === 'history' ? 1 : 2} />
        </div>
      </div>

      {mode === 'paa' && (
        <>
          <WebPaaWatch language={language} state={watch} showEmpty={showWatchedPlans} onRefresh={refreshWatch} />
          {watchError && <p role="alert" className="web-market-alert">{watchError}</p>}
        </>
      )}

      {showFilters && (
        <form className="web-secop-filters web-market-filters" onSubmit={submit}>
          <label>
            <span>{en ? 'Entity' : 'Entidad'}</span>
            <Input
              maxLength={300}
              value={entity}
              placeholder={en ? 'E.g., Ministry, Municipality, Agency…' : 'Ej. Ministerio, Alcaldía, Gobernación, INVIAS…'}
              onChange={event => setEntity(event.target.value)}
            />
          </label>
          <label>
            <span>{en ? 'Keywords' : 'Palabras clave'}</span>
            <Input
              maxLength={300}
              value={keyword}
              placeholder={en ? 'E.g., software, maintenance, consulting, security…' : 'Ej. software, mantenimiento, interventoría, vigilancia…'}
              onChange={event => setKeyword(event.target.value)}
            />
          </label>
          {mode === 'paa' ? (
            <label>
              <span>{en ? 'Year' : 'Año'}</span>
              <Input
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={event => setYear(event.target.value)}
              />
            </label>
          ) : (
            <label>
              <span>{en ? 'Supplier' : 'Proveedor'}</span>
              <Input
                maxLength={300}
                value={supplier}
                placeholder={en ? 'E.g., Contractor name or company…' : 'Ej. Razón social o nombre del proveedor…'}
                onChange={event => setSupplier(event.target.value)}
              />
            </label>
          )}

          <p className="web-secop-note web-market-disclaimer">
            {mode === 'paa'
              ? en
                ? 'These are planned purchases, not open tenders. Plans and dates can change; results follow the dataset order.'
                : 'Son compras planeadas, no licitaciones abiertas. Los planes y fechas pueden cambiar; los resultados siguen el orden del conjunto.'
              : mode === 'tvec'
                ? en
                  ? 'Published Virtual Store orders do not cover all public procurement.'
                  : 'Las órdenes publicadas de la Tienda Virtual no abarcan toda la contratación pública.'
                : en
                  ? 'SECOP II published contracts do not represent all awards or predict future outcomes.'
                  : 'Los contratos publicados en SECOP II no representan todas las adjudicaciones ni predicen resultados futuros.'}{' '}
            {en ? 'The source does not specify currency.' : 'La fuente no especifica la moneda.'}{' '}
            <a href={datasets[mode]} target="_blank" rel="noreferrer" className="web-link">
              {en ? 'Official data source' : 'Ver fuente oficial'}
            </a>
          </p>

          <div className="web-inline web-secop-actions">
            <Button icon={Search} type="submit" disabled={loading || summaryLoading}>
              {loading ? (en ? 'Searching…' : 'Buscando…') : (en ? 'Search' : 'Buscar')}
            </Button>
            <Button
              icon={RotateCcw}
              type="button"
              variant="outline"
              disabled={loading || summaryLoading}
              onClick={resetForm}
            >
              {en ? 'Clear' : 'Limpiar'}
            </Button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="web-market-alert">{error}</p>}
      {loading && <WebLoading message={en ? 'Searching public data…' : 'Consultando datos públicos…'}/>}

      {!searched && !loading && !error && (
        <div className="web-market-initial">
          <div className="web-market-initial-cards">
            <article className="web-market-initial-card">
              <Building2 size={18} aria-hidden="true" />
              <strong>{en ? 'Search by public entity' : 'Analiza por entidad compradora'}</strong>
              <p>
                {mode === 'paa'
                  ? en
                    ? 'Inspect what an entity plans to buy during the year and follow its PAA for version updates.'
                    : 'Consulta qué planea contratar una entidad en el año y sigue su PAA para recibir avisos cuando actualice su versión.'
                  : en
                    ? 'Review historical contracts or purchase orders signed by a specific public institution.'
                    : 'Revisa qué contratos u órdenes ha adjudicado una institución pública específica.'}
              </p>
            </article>
            <article className="web-market-initial-card">
              <Search size={18} aria-hidden="true" />
              <strong>{en ? 'Filter by sector or keyword' : 'Filtra por sector o palabra clave'}</strong>
              <p>
                {en
                  ? 'Enter keywords from your business line to benchmark contract values, modalities and schedules.'
                  : 'Escribe términos clave de tu línea de negocio para comparar cuantías, modalidades y cronogramas.'}
              </p>
            </article>
            <article className="web-market-initial-card">
              <BarChart3 size={18} aria-hidden="true" />
              <strong>
                {mode === 'paa'
                  ? en
                    ? 'Track version changes'
                    : 'Monitorea versiones del PAA'
                  : en
                    ? 'Benchmark suppliers & values'
                    : 'Evalúa proveedores y cuantías'}
              </strong>
              <p>
                {mode === 'paa'
                  ? en
                    ? 'Save key acquisition plans to your watch list and export results to CSV or Excel.'
                    : 'Guarda planes clave en tu lista de seguimiento y exporta los resultados a CSV o Excel.'
                  : en
                    ? 'Search by contractor name or calculate global SECOP II statistics (average, min and max values).'
                    : 'Busca por contratista o calcula estadísticas globales en SECOP II (valor promedio, mínimo y máximo).'}
              </p>
            </article>
          </div>
          <div className="web-market-initial-cta">
            <Button icon={Search} type="button" disabled={loading} onClick={() => void run(buildQuery(), 0)}>
              {en ? 'Load recent records now' : 'Consultar registros recientes ahora'}
            </Button>
          </div>
        </div>
      )}

      {query && !loading && !error && (
        <div className="web-market-workspace">
          <div className="web-market-kpis" role="region" aria-label={en ? 'Page metrics' : 'Métricas de la consulta'}>
            <div className="web-market-kpi-card">
              <span>{en ? 'Loaded records' : 'Registros en página'}</span>
              <strong>{pageStats.count}</strong>
              <small>
                {en ? 'Page' : 'Página'} {Math.floor(offset / 20) + 1}
              </small>
            </div>
            <div className="web-market-kpi-card">
              <span>{en ? 'Distinct entities (page)' : 'Entidades en página'}</span>
              <strong>{pageStats.entities}</strong>
              <small>{query.entity ? `${en ? 'Filter' : 'Filtro'}: ${query.entity}` : en ? 'All entities' : 'Todas las entidades'}</small>
            </div>
            <div className="web-market-kpi-card">
              <span>{mode === 'paa' ? (en ? 'Page estimated total' : 'Suma estimada (página)') : (en ? 'Page total value' : 'Suma en página')}</span>
              <strong>{money(pageStats.totalValue)}</strong>
              <small>{en ? 'Reported values on this page' : 'Valores informados en esta página'}</small>
            </div>
            <div className="web-market-kpi-card">
              <span>{en ? 'Page average value' : 'Promedio en página'}</span>
              <strong>{money(pageStats.avgValue)}</strong>
              <small>
                {en ? 'Queried' : 'Consulta'}:{' '}
                {new Intl.DateTimeFormat(en ? 'en-GB' : 'es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(checkedAt))}
              </small>
            </div>
          </div>

          <p className="web-market-note">
            {en ? 'Applied filters' : 'Filtros aplicados'}: {en ? 'Entity' : 'Entidad'}: <strong>{query.entity || '—'}</strong> ·{' '}
            {en ? 'Keywords' : 'Palabras clave'}: <strong>{query.keyword || '—'}</strong> ·{' '}
            {mode === 'paa' ? (en ? 'Year' : 'Año') : (en ? 'Supplier' : 'Proveedor')}:{' '}
            <strong>{mode === 'paa' ? query.year || '—' : query.supplier || '—'}</strong> · {en ? 'Shown' : 'Consulta mostrada'}:{' '}
            {new Intl.DateTimeFormat(en ? 'en-GB' : 'es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(checkedAt))}
          </p>

          {mode === 'history' && (
            <section className="web-market-summary">
              <div className="web-market-summary-head">
                <div>
                  <h2>{en ? 'Summary of matching records' : 'Resumen global de registros encontrados'}</h2>
                  <p>
                    {en
                      ? 'Calculated across all matching SECOP II records with a signing date, not just this page.'
                      : 'Calculado sobre todos los registros coincidentes de SECOP II con fecha de firma, no solo esta página.'}
                  </p>
                </div>
                <Button icon={BarChart3} variant="outline" size="sm" disabled={loading || summaryLoading} onClick={() => void calculate()}>
                  {summaryLoading ? (en ? 'Calculating…' : 'Calculando…') : summary ? (en ? 'Recalculate' : 'Recalcular') : (en ? 'Calculate summary' : 'Calcular resumen')}
                </Button>
              </div>
              {summaryError && <p role="alert" className="web-market-alert">{summaryError}</p>}
              {summary && (
                <>
                  <dl className="web-market-stats">
                    {(
                      [
                        [en ? 'Records' : 'Registros', summary.records],
                        [en ? 'Distinct contract IDs' : 'ID de contrato distintos', summary.contracts],
                        [en ? 'Records with a value' : 'Registros con valor', summary.values],
                        [en ? 'Average value' : 'Valor promedio', summary.average],
                        [en ? 'Minimum value' : 'Valor mínimo', summary.minimum],
                        [en ? 'Maximum value' : 'Valor máximo', summary.maximum],
                      ] as [string, number | null][]
                    ).map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{money(value)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p>
                    {en ? 'Signing dates' : 'Fechas de firma'}: {summary.from?.slice(0, 10) || '—'} – {summary.to?.slice(0, 10) || '—'} ·{' '}
                    {en ? 'Queried' : 'Consulta'}:{' '}
                    {new Intl.DateTimeFormat(en ? 'en-GB' : 'es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(summary.checkedAt))} ·{' '}
                    <a href={summary.sourceUrl} target="_blank" rel="noreferrer" className="web-link">
                      {en ? 'View source query' : 'Ver consulta de origen'}
                    </a>
                  </p>
                  <p>
                    {en
                      ? 'Values are approximate and include zero. Rows can repeat contract IDs; these figures do not recommend a price.'
                      : 'Valores aproximados que incluyen ceros. Las filas pueden repetir ID de contrato; estas cifras no recomiendan un precio.'}
                  </p>
                </>
              )}
            </section>
          )}

          <div className="web-market-toolbar">
            <div className="web-market-toolbar-left">
              <div className="web-market-local-search">
                <Filter size={14} aria-hidden="true" />
                <Input
                  value={pageSearch}
                  onChange={e => setPageSearch(e.target.value)}
                  placeholder={en ? 'Filter loaded rows…' : 'Filtrar filas de esta página…'}
                  aria-label={en ? 'Filter loaded rows' : 'Filtrar filas de esta página'}
                />
              </div>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                aria-label={en ? 'Sort loaded rows' : 'Ordenar filas cargadas'}
              >
                <option value="default">{en ? 'Dataset order' : 'Orden de la fuente'}</option>
                <option value="value-desc">{en ? 'Highest value first' : 'Mayor valor primero'}</option>
                <option value="value-asc">{en ? 'Lowest value first' : 'Menor valor primero'}</option>
                <option value="entity-asc">{en ? 'Entity (A–Z)' : 'Entidad (A–Z)'}</option>
              </select>
            </div>

            <div className="web-market-toolbar-right">
              <div className="web-market-view-switch" role="group" aria-label={en ? 'View layout' : 'Modo de vista'}>
                <Button
                  icon={LayoutList}
                  size="sm"
                  variant={viewLayout === 'cards' ? 'default' : 'outline'}
                  aria-pressed={viewLayout === 'cards'}
                  onClick={() => setViewLayout('cards')}
                >
                  {en ? 'Cards' : 'Tarjetas'}
                </Button>
                <Button
                  icon={Table2}
                  size="sm"
                  variant={viewLayout === 'table' ? 'default' : 'outline'}
                  aria-pressed={viewLayout === 'table'}
                  onClick={() => setViewLayout('table')}
                >
                  {en ? 'Table' : 'Tabla'}
                </Button>
              </div>
              <Button
                icon={FileDown}
                iconOnly
                size="sm"
                variant="outline"
                disabled={!displayedItems.length}
                onClick={() => void exportPage('csv')}
              >
                {en ? 'Export CSV' : 'Exportar CSV'}
              </Button>
              <Button
                icon={FileSpreadsheet}
                iconOnly
                size="sm"
                variant="outline"
                disabled={!displayedItems.length}
                onClick={() => void exportPage('xlsx')}
              >
                {en ? 'Export Excel' : 'Exportar Excel'}
              </Button>
              <Button
                icon={RefreshCw}
                iconOnly
                size="sm"
                variant="outline"
                disabled={loading || summaryLoading}
                onClick={() => void run(query, offset)}
              >
                {en ? 'Refresh' : 'Actualizar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {searched && !loading && !error && !displayedItems.length && (
        <div className="web-agenda-empty">
          <Search size={24} aria-hidden="true" />
          <p role="status">
            {items.length > 0 && pageSearch.trim()
              ? en
                ? 'No rows on this page match your local filter.'
                : 'Ninguna fila de esta página coincide con el filtro local.'
              : en
                ? 'No records for these filters.'
                : 'No se encontraron registros con estos filtros.'}
          </p>
        </div>
      )}

      {!loading && !error && !!displayedItems.length && viewLayout === 'table' && (
        <div className="web-secop-table-scroll web-market-table-scroll" aria-live="polite">
          <Table aria-label={en ? 'Market intelligence results' : 'Resultados de inteligencia de mercado'}>
            <TableHeader>
              <TableRow>
                <TableHead>{en ? 'Entity' : 'Entidad'}</TableHead>
                <TableHead>{en ? 'Description / Object' : 'Descripción / Objeto'}</TableHead>
                {mode === 'paa' ? (
                  <>
                    <TableHead>{en ? 'Modality / UNSPSC' : 'Modalidad / UNSPSC'}</TableHead>
                    <TableHead>{en ? 'Dates' : 'Fechas previstas'}</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>{en ? 'Supplier' : 'Proveedor'}</TableHead>
                    <TableHead>{en ? 'Date' : 'Fecha'}</TableHead>
                  </>
                )}
                <TableHead>{en ? 'Value' : 'Valor'}</TableHead>
                <TableHead>{en ? 'Actions' : 'Acciones'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedItems.map((item, index) => {
                const isFollowing = watch?.items.some(plan => plan.planId === item.planId);
                return (
                  <TableRow key={`${item.id}:${index}`}>
                    <TableCell>
                      <strong>{item.entity || '—'}</strong>
                      <div>
                        <small className="web-secop-export-note">{item.id || '—'}</small>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="web-secop-cell-text" title={item.description}>
                        {item.description || (en ? 'Description unavailable' : 'Descripción no disponible')}
                      </span>
                    </TableCell>
                    {mode === 'paa' ? (
                      <>
                        <TableCell>
                          <div>{item.modality || '—'}</div>
                          <small className="web-secop-export-note">UNSPSC: {item.classifications || '—'}</small>
                        </TableCell>
                        <TableCell>
                          <div>
                            {en ? 'Start' : 'Inicio'}: {item.startDate || '—'}
                          </div>
                          <small className="web-secop-export-note">
                            {en ? 'Offers' : 'Ofertas'}: {item.offerDate || '—'}
                          </small>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>
                          <div>{item.supplier || '—'}</div>
                          <small className="web-secop-export-note">ID: {item.supplierId || '—'}</small>
                        </TableCell>
                        <TableCell>
                          <div>{item.date?.slice(0, 10) || '—'}</div>
                          {mode === 'tvec' && <small className="web-secop-export-note">{item.status || '—'}</small>}
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <strong>{money(item.value)}</strong>
                    </TableCell>
                    <TableCell>
                      <div className="web-inline">
                        {item.id && (
                          <a href={recordUrl(mode, item.id)} target="_blank" rel="noreferrer" className="web-link">
                            {en ? 'View source record' : 'Ver registro oficial'}
                          </a>
                        )}
                        {mode === 'paa' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!item.planId || !watch || !!following || isFollowing}
                            onClick={() => item.planId && void follow(item.planId)}
                          >
                            {isFollowing ? (en ? 'Following' : 'Siguiendo') : (en ? 'Follow plan' : 'Seguir plan')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && !error && !!displayedItems.length && viewLayout === 'cards' && (
        <div className="web-market-results" aria-live="polite">
          {displayedItems.map((item, index) => {
            const isFollowing = watch?.items.some(plan => plan.planId === item.planId);
            return (
              <article key={`${item.id}:${index}`} className="web-market-card">
                <div className="web-market-card-head">
                  <div className="web-market-card-badges">
                    <span className="web-market-badge">{item.entity || '—'}</span>
                    {mode === 'paa' && item.year && <span className="web-market-badge is-subtle">{item.year}</span>}
                    {mode === 'paa' && item.modality && <span className="web-market-badge is-subtle">{item.modality}</span>}
                    {mode === 'tvec' && item.status && <span className="web-market-badge is-subtle">{item.status}</span>}
                    <small className="web-market-card-id">{item.id || '—'}</small>
                  </div>
                  <div className="web-market-card-value">
                    <span>
                      {mode === 'paa'
                        ? en
                          ? 'Estimated value'
                          : 'Valor estimado'
                        : mode === 'tvec'
                          ? en
                            ? 'Order total'
                            : 'Total de la orden'
                          : en
                            ? 'Contract value'
                            : 'Valor del contrato'}
                    </span>
                    <strong>{money(item.value)}</strong>
                  </div>
                </div>

                <h3>{item.description || (en ? 'Description unavailable' : 'Descripción no disponible')}</h3>

                {mode === 'paa' ? (
                  <div className="web-market-card-details">
                    <p>
                      {en ? 'Expected start' : 'Inicio previsto'}: <strong>{item.startDate || '—'}</strong> ·{' '}
                      {en ? 'Expected offers' : 'Ofertas previstas'}: <strong>{item.offerDate || '—'}</strong>
                    </p>
                    <p>
                      UNSPSC: {item.classifications || '—'} · {en ? 'Plan version' : 'Versión del plan'}: {item.version || '—'}{' '}
                      {item.versionDate && `(${item.versionDate})`}
                    </p>
                  </div>
                ) : (
                  <div className="web-market-card-details">
                    <p>
                      {en ? 'Supplier' : 'Proveedor'}: <strong>{item.supplier || '—'}</strong> · {en ? 'ID' : 'Identificación'}:{' '}
                      {item.supplierId || '—'} · {en ? 'Date' : 'Fecha'}: <strong>{item.date?.slice(0, 10) || '—'}</strong>
                    </p>
                  </div>
                )}

                <div className="web-market-card-footer">
                  <div className="web-inline">
                    {item.entity && item.entity !== query?.entity && (
                      <Button variant="ghost" size="sm" type="button" onClick={() => quickPivotEntity(item.entity)}>
                        {en ? 'Filter by this entity' : 'Filtrar esta entidad'}
                      </Button>
                    )}
                    {mode !== 'paa' && item.supplier && item.supplier !== query?.supplier && (
                      <Button variant="ghost" size="sm" type="button" onClick={() => quickPivotSupplier(item.supplier!)}>
                        {en ? 'Filter by this supplier' : 'Filtrar este proveedor'}
                      </Button>
                    )}
                  </div>

                  <div className="web-inline">
                    {mode === 'paa' && (
                      <Button
                        icon={isFollowing ? BookmarkCheck : BookmarkPlus}
                        size="sm"
                        variant="outline"
                        disabled={!item.planId || !watch || !!following || isFollowing}
                        onClick={() => item.planId && void follow(item.planId)}
                      >
                        {isFollowing ? (en ? 'Following' : 'Siguiendo') : (en ? 'Follow plan' : 'Seguir plan')}
                      </Button>
                    )}
                    {item.id && (
                      <a href={recordUrl(mode, item.id)} target="_blank" rel="noreferrer" className="web-market-record-link">
                        <span>{en ? 'View source record' : 'Ver registro oficial'}</span>
                        <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {query && !error && (
        <div className="web-market-pagination">
          <Button
            icon={ChevronLeft}
            variant="outline"
            size="sm"
            disabled={loading || summaryLoading || offset === 0}
            onClick={() => void run(query, Math.max(0, offset - 20))}
          >
            {en ? 'Previous' : 'Anterior'}
          </Button>
          <span>
            {en ? 'Page' : 'Página'} {Math.floor(offset / 20) + 1}
          </span>
          <Button
            icon={ChevronRight}
            variant="outline"
            size="sm"
            disabled={loading || summaryLoading || !hasMore}
            onClick={() => void run(query, offset + 20)}
          >
            {en ? 'Next' : 'Siguiente'}
          </Button>
        </div>
      )}
    </section>
  );
}
