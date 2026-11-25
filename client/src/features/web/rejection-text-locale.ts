const LEGACY_REJECTION_FALLBACKS: Record<string, [string, string]> = {
  '未明确引用具体检查依据，请人工复核。': [
    'No se citó un requisito específico; revisa manualmente.',
    'No specific requirement was cited; please review manually.',
  ],
  '请结合招标文件要求和投标文件原文人工复核后处理。': [
    'Revisa manualmente frente a los requisitos del pliego y el texto de la oferta.',
    'Review manually against the tender requirements and bid text.',
  ],
  '疑似错别字，请结合原文复核。': [
    'Posible error ortográfico; verifica con el texto original.',
    'Possible typo; please verify against the original text.',
  ],
  '未提供明确原文摘录，请结合位置线索复核。': [
    'No se proporcionó un extracto textual exacto; revisa según la ubicación.',
    'No explicit excerpt provided; review using the location hint.',
  ],
  '未明确具体位置，请结合原文摘录复核。': [
    'Ubicación no especificada; revisa con el texto original.',
    'Location not specified; review using the original text.',
  ],
  '请结合投标文件上下文人工复核后修改。': [
    'Revisa manualmente en contexto y corrige la oferta.',
    'Review manually in context and revise the bid text.',
  ],
};

/** Normalize legacy Chinese fallback strings stored in older rejection-check reports. */
export function localizeRejectionFieldText(value: string, language: 'es' | 'en'): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const mapped = LEGACY_REJECTION_FALLBACKS[trimmed];
  if (mapped) return language === 'en' ? mapped[1] : mapped[0];
  return value.replace(
    /原文第\s*(\d+)\s*行附近/g,
    (_match, line: string) => (language === 'en' ? `Near line ${line}` : `Cerca de la línea ${line}`),
  );
}
