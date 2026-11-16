// Execution details use the redacted console channel; progress remains categorical.
export function trackPiProgress(runtime, context) {
  const runTask = runtime.runTask.bind(runtime);
  runtime.runTask = task => {
    context.reportProgress?.('generating');
    return runTask({ ...task, onConsole: event => { context.reportConsole?.(event); task.onConsole?.(event); }, onUsage: usage => { context.reportUsage?.(usage); task.onUsage?.(usage); }, onActivity: event => {
      if (['pi.tool.start','pi.tool.end'].includes(event.source)) context.reportActivity?.(`tool.${event.meta?.tool}.${event.source.endsWith('start')?'start':event.meta?.is_error?'error':'end'}`, {path:event.meta?.path});
      if (event.source === 'pi.tool.start') context.reportProgress?.(['read', 'grep', 'find', 'ls'].includes(event.meta?.tool) ? 'reading' : 'generating');
      else if (event.source === 'pi.tool.end' || event.source === 'pi.message') context.reportProgress?.('generating');
      task.onActivity?.(event);
    } });
  };
  return runtime;
}
