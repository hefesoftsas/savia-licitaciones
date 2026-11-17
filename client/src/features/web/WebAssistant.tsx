import {Search, FolderOpen} from 'lucide-react';
import {ActionButton as Button} from '@/shared/ui/ActionButton';
import type {ProcurementMarket} from '@/shared/types/secop';

type Props = {
  language: 'es' | 'en';
  market?: ProcurementMarket;
  project: {id: string; title: string} | null;
  onSearch: () => void;
  onProjects: () => void;
};

export function WebAssistant({language, market = 'ALL', project, onSearch, onProjects}: Props) {
  const en = language === 'en';
  const portalName = market === 'ES' ? 'PLACSP' : market === 'CO' ? 'SECOP' : (en ? 'procurement portals' : 'plataformas de contratación');
  const stages = en ? ['Find a tender', 'Prepare the bid', 'Review and export'] : ['Buscar licitación', 'Preparar la oferta', 'Revisar y exportar'];
  return <section className="web-assistant">
    <h2>{en ? 'From an opportunity to a Word document' : 'De una oportunidad a un documento Word'}</h2>
    <p>{en ? 'Find a tender, choose its documents and prepare your response. Review the result before exporting it.' : 'Busca una licitación, elige sus documentos y prepara tu respuesta. Revisa el resultado antes de exportarlo.'}</p>
    <ol aria-label={en ? 'Workflow stages' : 'Etapas del recorrido'}>{stages.map(stage => <li key={stage}>{stage}</li>)}</ol>
    <div className="web-assistant-actions">
      <section><h3>{en ? `Start with ${portalName}` : `Empezar en ${portalName}`}</h3><p>{en ? 'Search for an opportunity and select the documents to use.' : 'Busca una oportunidad y selecciona los documentos con los que vas a trabajar.'}</p><Button icon={Search} onClick={onSearch}>{en ? 'Search opportunities' : 'Buscar oportunidades'}</Button></section>
      {project && <section><h3>{en ? 'Continue your project' : 'Continuar tu proyecto'}</h3><p>{project.title}</p><Button variant="outline" onClick={onProjects}>{en ? 'Resume preparation' : 'Retomar preparación'}</Button></section>}
    </div>
    <Button icon={FolderOpen} variant="link" onClick={onProjects}>{en ? 'View projects' : 'Ver proyectos'}</Button>
  </section>;
}
