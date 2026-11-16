export function detectTechnicalScore(content) {
  const text = String(content || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const noScore = /(?:no\s+(?:hay|existen?|se\s+(?:identifican?|encontraron?|asignan?|evidencian?))|ningun[oa]?|sin)\s+(?:[^.!\n]{0,45}\s+)?(?:criterios?\s+tecnic[oa]s?\s+(?:de\s+)?(?:puntuacion|puntuables?|con\s+puntaje)|criterios?\s+(?:de\s+)?(?:puntuacion|evaluacion)\s+tecnic[oa]s?|puntuacion\s+tecnica|puntaje\s+tecnico)/.test(text);
  const affirmative = /(?:criterio|factor|puntaje|puntuacion)\s+tecnic[oa][^.!\n]{0,100}\b\d+(?:[.,]\d+)?\s*(?:puntos?|%|por\s+ciento)/.test(text);
  return noScore && !affirmative ? 'none' : affirmative && !noScore ? 'present' : 'unknown';
}

export function localizeOutlineMessage(value, language = 'es') {
  const en = language === 'en';
  return String(value || '')
    .replace(/目录生成失败\s*[：:]/g, en ? 'Outline generation failed: ' : 'Falló la generación del índice: ')
    .replace(/技术评分信息\.md/g, en ? 'technical scoring analysis' : 'análisis de criterios técnicos');
}
