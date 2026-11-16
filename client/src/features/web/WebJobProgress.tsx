type Props = { state: string; progress?: string | null; language: 'es' | 'en' };
const messages: Record<string, { es: string; en: string }> = {
  preparing: { es: 'Preparando fuentes…', en: 'Preparing sources…' },
  reading: { es: 'Consultando fuentes…', en: 'Reading sources…' },
  ocr: { es: 'Reconociendo texto escaneado (OCR)…', en: 'Recognizing scanned text (OCR)…' },
  generating: { es: 'Generando contenido…', en: 'Generating content…' },
};
export function WebJobProgress({ state, progress, language }: Props) {
  const message = progress && Object.hasOwn(messages, progress) ? messages[progress] : null;
  return state === 'running' && message ? <p role="status">{message[language]}</p> : null;
}
