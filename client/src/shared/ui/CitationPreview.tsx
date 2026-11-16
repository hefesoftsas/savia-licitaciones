import { useId, useMemo, useState } from 'react';
import { useLanguage } from '../i18n';
import RupPdfPreview from './RupPdfPreview';
import { Button } from './primitives/button';
import './citation-preview.css';

type Result = Awaited<ReturnType<typeof window.savia.citationSource.open>>;

export default function CitationPreview({ processId, sourceId, quote, stale, kind = 'tender' }: { processId: string; sourceId: string; quote: string; stale: boolean; kind?: 'tender' | 'offer' }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const sourceIdForAccessibility = useId();
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pdfBytes = useMemo(() => result?.bytes ? new Uint8Array(result.bytes) : null, [result]);
  const open = async () => {
    if (result) { setResult(null); return; }
    setBusy(true); setError('');
    try {
      const data = await window.savia.citationSource.open(processId, sourceId, quote, language, kind);
      setPage(data.pages[0] || 1); setResult(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  return <div className="citation-preview">
    <Button variant="outline" size="sm" disabled={stale || busy} aria-expanded={Boolean(result)} aria-controls={result ? sourceIdForAccessibility : undefined} onClick={() => void open()}>{busy ? (en ? 'Finding source…' : 'Buscando fuente…') : result ? (en ? 'Close source' : 'Cerrar fuente') : (en ? 'Open source' : 'Abrir fuente')}</Button>
    {error && <p className="citation-error" role="alert">{error}</p>}
    {result && <div id={sourceIdForAccessibility}>{result.kind === 'pdf' && result.bytes ? <>
      <p className="citation-note">{result.locationUnavailable ? (en ? 'The page could not be located. Review the original manually; no page was inferred.' : 'No se pudo localizar la página. Revisa el original manualmente; no se infirió una página.') : result.pages.length ? (en ? `Exact text found on ${result.pages.length} page(s). Check the context in the original.` : `Texto encontrado en ${result.pages.length} página(s). Revisa el contexto en el original.`) : (en ? 'The extracted PDF text does not contain this quote. Review the original manually; no page was inferred.' : 'El texto extraído del PDF no contiene esta cita. Revisa el original manualmente; no se infirió una página.')}</p>
      {result.pages.length > 1 && <div className="citation-pages">{result.pages.map(number => <Button key={number} variant={number === page ? 'default' : 'outline'} size="sm" aria-pressed={number === page} onClick={() => setPage(number)}>{en ? 'Page' : 'Página'} {number}</Button>)}</div>}
      {pdfBytes && <RupPdfPreview bytes={pdfBytes} en={en} initialPage={page} onPageChange={setPage} />}
    </> : <><p className="citation-note">{result.originalAvailable ? (en ? 'Page location is available for PDF sources. Review the quote in the original Word document.' : 'La ubicación por página está disponible para PDF. Revisa la cita en el documento Word original.') : (en ? 'The original file is not saved. Only the extracted quote is available.' : 'El archivo original no está guardado. Solo está disponible la cita extraída.')}</p>
      {result.kind === 'docx' && result.bytes && <Button variant="outline" size="sm" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await window.savia.libreOffice.openDocument({ bytes: new Uint8Array(result.bytes!), name: 'documento-citado.docx' }); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); } }}>{en ? 'Open a Word copy' : 'Abrir copia de Word'}</Button>}</>}</div>}
  </div>;
}
