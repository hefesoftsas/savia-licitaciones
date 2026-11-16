export function secopStatusTone(value: string) {
  const key = value.trim().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  if (['publicado', 'publicada', 'convocado', 'convocada', 'abierto', 'abierta'].includes(key)) return 'open';
  if (['evaluacion', 'en evaluacion', 'adjudicado', 'adjudicada'].includes(key)) return 'progress';
  if (['cancelado', 'cancelada', 'descartado', 'descartada', 'declarado desierto', 'desierto', 'desierta', 'cerrado', 'cerrada', 'terminado', 'terminada'].includes(key)) return 'closed';
  return 'neutral';
}
