export type ChatUsage = { input: number; output: number; cacheRead: number; cacheWrite: number; reportedCalls: number; unreportedCalls: number };

export function WebChatUsage({language, usage, model, scope = 'chat'}: {language: 'es' | 'en'; usage?: ChatUsage | null; model?: string; scope?: 'chat' | 'attempt'}) {
  const es = language === 'es';
  if (!usage || !['input', 'output', 'cacheRead', 'cacheWrite', 'reportedCalls', 'unreportedCalls'].every(key => Number.isSafeInteger(usage[key as keyof ChatUsage]) && usage[key as keyof ChatUsage] >= 0) || usage.reportedCalls === 0) {
    return <div className="web-chat-usage">{model && <p>{es ? 'Modelo' : 'Model'}: {model}</p>}<p>{scope === 'attempt' ? (es ? 'Consumo no disponible para el último intento.' : 'Usage is unavailable for the last attempt.') : (es ? 'Consumo no disponible para esta consulta.' : 'Usage is unavailable for this question.')}</p></div>;
  }
  const format = (value: number) => value.toLocaleString(es ? 'es-CO' : 'en-US');
  return <div className="web-chat-usage">
    {model && <p>{es ? 'Modelo' : 'Model'}: {model}</p>}
    <strong>{es ? `Consumo reportado${scope === 'attempt' ? ' del último intento' : ''}${usage.unreportedCalls ? ' (parcial)' : ''}` : `Reported usage${scope === 'attempt' ? ' for the last attempt' : ''}${usage.unreportedCalls ? ' (partial)' : ''}`}</strong>
    <p>{es ? 'Entrada' : 'Input'}: {format(usage.input)} · {es ? 'Salida' : 'Output'}: {format(usage.output)} · {es ? 'Caché leída' : 'Cache read'}: {format(usage.cacheRead)} · {es ? 'Caché escrita' : 'Cache write'}: {format(usage.cacheWrite)} tokens</p>
    {scope === 'attempt' && <p>{es ? 'No incluye intentos anteriores ni consumo que no se haya podido entregar.' : 'Previous attempts and usage that could not be delivered are not included.'}</p>}
    <p>{es ? 'Datos reportados por Pi. Si el proveedor no informa la caché, puede aparecer como cero. Consulta su facturación.' : 'Usage reported by Pi. Unreported cache usage may appear as zero. Check provider billing.'}</p>
  </div>;
}
