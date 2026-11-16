'use strict';
function formatBidEvaluationReport(run, language = 'es') {
  if (run?.status !== 'completed' || !run.result) throw new Error('La evaluación no está completada.');
  const en = language === 'en';
  const names = new Map([...run.tenderSources, ...run.bidSources].map(source => [source.id, source.name]));
  const lines = [en ? '# Offer evaluation' : '# Evaluación de oferta', '', `${en ? 'Date' : 'Fecha'}: ${run.createdAt}`, '', en ? 'AI suggestions require human review. Missing evidence does not prove noncompliance. No total is calculated.' : 'Las sugerencias de IA requieren revisión humana. La falta de evidencia no demuestra incumplimiento. No se calcula un total.', ''];
  if (run.result.unreadableDocuments.length) lines.push(en ? 'Some documents have no readable text; results may be incomplete.' : 'Algunos documentos no tienen texto legible; los resultados pueden estar incompletos.', '');
  if (run.result.discardedCount) lines.push(en ? 'Some unsupported criteria were omitted.' : 'Se omitieron criterios cuya fuente no pudo verificarse.', '');
  for (const item of run.result.criteria) {
    const review = run.reviews.find(entry => entry.criterionId === item.id);
    lines.push(`## ${item.name}`, '', `${en ? 'Tender' : 'Pliego'}: ${names.get(item.tenderSourceId) || ''}`, '', `> ${item.tenderQuote.replace(/\n/g, '\n> ')}`, '', `${en ? 'Offer' : 'Oferta'}: ${names.get(item.bidSourceId) || (en ? 'No verified evidence' : 'Sin evidencia verificable')}`, '');
    if (item.bidQuote) lines.push(`> ${item.bidQuote.replace(/\n/g, '\n> ')}`, '');
    lines.push(`${en ? 'Suggested score' : 'Puntaje sugerido'}: ${item.proposedPoints ?? (en ? 'Not available' : 'No disponible')} / ${item.maxPoints ?? (en ? 'unverified' : 'no verificado')}`, '');
    if (item.explanation) lines.push(item.explanation, '');
    const reviewStatus = review && ({ accepted: en ? 'Reviewed' : 'Revisado', adjusted: en ? 'Adjusted' : 'Ajustado', unresolved: en ? 'Pending' : 'Pendiente' })[review.status];
    if (review) lines.push(`${en ? 'Human review' : 'Revisión humana'}: ${reviewStatus || review.status}`, `${en ? 'Reviewed score' : 'Puntaje revisado'}: ${review.score ?? (en ? 'Not assigned' : 'Sin asignar')}`, `${en ? 'Note' : 'Nota'}: ${review.note}`, '');
  }
  if (!run.result.criteria.length) lines.push(en ? 'No verifiable criteria were found.' : 'No se encontraron criterios verificables.', '');
  return lines.join('\n');
}
module.exports = { formatBidEvaluationReport };
