'use strict';
function textContent(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every(part => part?.type === 'text' && typeof part.text === 'string')) return value.map(part => part.text).join('\n');
  throw new Error('OpenCode Go aún no admite imágenes ni contenido multimodal en esta integración.');
}

function toResponsesRequest(source = {}) {
  if (source.tool_choice && source.tool_choice !== 'auto') throw new Error('OpenCode Go solo admite tool_choice auto.');
  if (!Array.isArray(source.messages) || !source.messages.length) throw new Error('La solicitud no contiene mensajes.');
  const input = [];
  for (const message of source.messages) {
    if (message.role === 'tool') {
      if (!message.tool_call_id) throw new Error('Falta el identificador del resultado de herramienta.');
      input.push({ type:'function_call_output', call_id:message.tool_call_id, output:textContent(message.content) });
    } else if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      const content = textContent(message.content);
      if (content) input.push({role:'assistant',content});
      for (const call of message.tool_calls) {
        if (call.type !== 'function' || !call.id || !call.function?.name || typeof call.function.arguments !== 'string') throw new Error('Llamada de herramienta incompleta.');
        input.push({type:'function_call',call_id:call.id,name:call.function.name,arguments:call.function.arguments});
      }
    } else if (['system','developer','user','assistant'].includes(message.role)) {
      input.push({role:message.role,content:textContent(message.content)});
    } else throw new Error('Tipo de mensaje no compatible con OpenCode Go.');
  }
  const result = { model:source.model, input };
  if (Number(source.max_completion_tokens) > 0) result.max_output_tokens = source.max_completion_tokens;
  if (source.reasoning_effort && source.reasoning_effort !== 'none') result.reasoning = {effort:source.reasoning_effort};
  if (source.temperature !== undefined) result.temperature = source.temperature;
  if (source.response_format?.type === 'json_object') result.text = { format:{type:'json_object'} };
  else if (source.response_format) throw new Error('Formato de respuesta no compatible con OpenCode Go.');
  if (Array.isArray(source.tools) && source.tools.length) {
    result.tools = source.tools.map(tool => {
      if (tool.type !== 'function' || !tool.function?.name) throw new Error('Herramienta no compatible con OpenCode Go.');
      return {type:'function',...tool.function};
    });
    result.tool_choice = 'auto';
  }
  return result;
}

function convertUsage(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return undefined;
  const input = usage.input_tokens, output = usage.output_tokens, total = usage.total_tokens;
  if (![input, output, total].every(value => Number.isSafeInteger(value) && value >= 0) || !Number.isSafeInteger(input + output) || input + output !== total) return undefined;
  const cached = usage.input_tokens_details?.cached_tokens, reasoning = usage.output_tokens_details?.reasoning_tokens;
  if (cached !== undefined && (!Number.isSafeInteger(cached) || cached < 0 || cached > input)) return undefined;
  if (reasoning !== undefined && (!Number.isSafeInteger(reasoning) || reasoning < 0 || reasoning > output)) return undefined;
  return {prompt_tokens:input,completion_tokens:output,total_tokens:total,
    ...(cached === undefined ? {} : {prompt_tokens_details:{cached_tokens:cached}}),
    ...(reasoning === undefined ? {} : {completion_tokens_details:{reasoning_tokens:reasoning}})};
}

function toChatCompletion(response = {}) {
  if (!['completed','incomplete'].includes(response.status)) throw new Error('OpenCode Go no completó la solicitud.');
  const output = Array.isArray(response.output) ? response.output : [];
  const text = output.filter(item => item.type === 'message').flatMap(item => Array.isArray(item.content) ? item.content : []).filter(part => part.type === 'output_text').map(part => part.text || '').join('');
  const calls = output.filter(item => item.type === 'function_call').map(item => ({id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments}}));
  if (calls.some(call => !call.id || !call.function.name || typeof call.function.arguments !== 'string')) throw new Error('OpenCode Go devolvió una llamada de herramienta incompleta.');
  const finish = response.status === 'incomplete' ? 'length' : calls.length ? 'tool_calls' : 'stop';
  const usage = convertUsage(response.usage);
  return { id:response.id, object:'chat.completion', model:response.model, choices:[{index:0,message:{role:'assistant',content:text || null,...(calls.length ? {tool_calls:calls} : {})},finish_reason:finish}], ...(usage ? {usage} : {}) };
}
module.exports = { toResponsesRequest, toChatCompletion };
