'use strict';
const crypto = require('node:crypto');

const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function quoteContainsValue(quote, value) {
  const text = normalize(quote), token = normalize(value);
  if (!/^[+-]?\d[\d.,]*$/.test(token)) return text.includes(token);
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\d.,])${escaped}(?![\\d.,])`).test(text);
}

function isSpanishAccreditation(pages, jurisdiction) {
  if (jurisdiction === 'ES') return true;
  if (jurisdiction === 'CO') return false;
  const sample = pages.slice(0, 5).map(p => p.layoutText || p.text || '').join('\n');
  return /\b(ROLECE|DEUC|RELI|LCSP|Clasificaci[oó]n\s+empresarial|Registro\s+Oficial\s+de\s+Licitadores)\b/i.test(sample);
}

function buildAccreditationPrompt(en, spanish) {
  if (spanish) {
    return `Analyze this Spanish public procurement accreditation document (ROLECE, RELI, DEUC, or classification/solvency certificate) using only the text files in pages/. Each file name is its PDF page number. Search all available pages for company identification (NIF/CIF, corporate name), ROLECE/RELI registration number and validity/issue dates, business classification (clasificación empresarial: grupo, subgrupo, categoría), economic and financial solvency indicators (annual turnover, net equity, solvency ratios with fiscal years), technical/professional solvency (executed contracts, amounts in EUR, dates, contracting entities), and 8-digit CPV codes. Report only values explicitly supported by the same page. Never invent or calculate values or page numbers. Return only a JSON array, without Markdown, of objects {"label":"description including fiscal year, contract reference or classification group when available","value":"exact value as in the source","page":1,"quote":"short exact contiguous excerpt containing the value"}. Write labels in ${en ? 'English' : 'Spanish'}; preserve the original text and punctuation in values and quotes. Do not save or change files. Missing, ambiguous or unreadable data must be omitted. The answer is a set of suggestions for human review, not an eligibility decision.`;
  }
  return `Analyze this Colombian RUP certificate using only the text files in pages/. Each file name is its PDF page number. Search all available pages for financial indicators with cutoff dates, validity and firmness, contract experience, contractor role, amounts and UNSPSC codes. Report only values explicitly supported by the same page. Never invent or calculate values or page numbers. Return only a JSON array, without Markdown, of objects {"label":"description including cutoff date or contract number when available","value":"exact value as in the source","page":1,"quote":"short exact contiguous excerpt containing the value"}. Write labels in ${en ? 'English' : 'Spanish'}; preserve the original text and punctuation in values and quotes. Do not save or change files. Missing, ambiguous or unreadable data must be omitted. The answer is a set of suggestions for human review, not an eligibility decision.`;
}

function createRupAgentService({ certificate, agentService, getConfig }) {
  let running = false;
  async function analyze(language, options = {}) {
    const en = language === 'en';
    if (running) throw Error(en ? 'RUP analysis is already running.' : 'El análisis del RUP ya está en curso.');
    const config = getConfig();
    if ((config.text_model_provider !== 'opencode-go' && !(config.text_model_provider === 'openai-api' && config.web_runner_openai_rup === true) && !(config.text_model_provider === 'anthropic-api' && config.web_runner_anthropic_native === true) && !(config.text_model_provider === 'google-api' && config.web_runner_google_native === true) && !(config.text_model_provider === 'google-vertex-api' && config.web_runner_vertex_native === true && config.base_url === 'https://aiplatform.googleapis.com') && !(config.text_model_provider === 'groq-api' && config.web_runner_groq_proxy === true && config.base_url === 'https://api.groq.com/openai/v1') && !(config.text_model_provider === 'xai-api' && config.web_runner_xai_native === true && config.base_url === 'https://api.x.ai/v1') && !(config.text_model_provider === 'deepseek-api' && config.web_runner_deepseek_native === true && config.base_url === 'https://api.deepseek.com') && !(config.text_model_provider === 'mistral-api' && config.web_runner_mistral_native === true && config.base_url === 'https://api.mistral.ai') && !(config.text_model_provider === 'cerebras-api' && config.web_runner_cerebras_native === true && config.base_url === 'https://api.cerebras.ai/v1') && !(config.text_model_provider === 'together-api' && config.web_runner_together_native === true && config.base_url === 'https://api.together.ai/v1') && !(config.text_model_provider === 'nvidia-api' && config.web_runner_nvidia_native === true && config.base_url === 'https://integrate.api.nvidia.com/v1') && !(config.text_model_provider === 'fireworks-api' && config.web_runner_fireworks_native === true && config.base_url === 'https://api.fireworks.ai/inference') && !(config.text_model_provider === 'huggingface-api' && config.web_runner_huggingface_native === true && config.base_url === 'https://router.huggingface.co/v1') && !(((config.text_model_provider === 'minimax-api' && config.base_url === 'https://api.minimax.io/anthropic') || (config.text_model_provider === 'minimax-cn-api' && config.base_url === 'https://api.minimaxi.com/anthropic')) && config.web_runner_minimax_native === true) && !(((config.text_model_provider === 'moonshot-api' && config.base_url === 'https://api.moonshot.ai/v1') || (config.text_model_provider === 'moonshot-cn-api' && config.base_url === 'https://api.moonshot.cn/v1')) && config.web_runner_moonshot_native === true) && !(config.text_model_provider === 'azure-openai-api' && config.web_runner_azure_native === true && /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.openai\.azure\.com\/openai\/v1$/.test(config.base_url)) && !(config.text_model_provider === 'xiaomi-api' && config.web_runner_xiaomi_native === true && config.base_url === 'https://api.xiaomimimo.com/v1') && !(config.text_model_provider === 'zai-api' && config.web_runner_zai_native === true && config.base_url === 'https://api.z.ai/api/paas/v4') && !(config.text_model_provider === 'ant-ling-api' && config.web_runner_ant_ling_native === true && config.base_url === 'https://api.ant-ling.com/v1') && !(config.text_model_provider === 'opencode-zen' && config.web_runner_opencode_zen_native === true && config.base_url === 'https://opencode.ai/zen/v1')) || !config.api_key || !config.model_name) throw Error(en ? 'Configure an OpenCode Go text model and API key in Settings.' : 'Configura un modelo de texto y una clave de OpenCode Go en Ajustes.');
    running = true;
    try {
      const digest = hash(certificate.readPdf());
      const pages = await certificate.extractPages();
      const readable = pages.filter(page => (page.text || page.layoutText || '').trim());
      if (!readable.length) throw Error(en ? 'No selectable text was found in the certificate. Review the scanned PDF manually.' : 'No se encontró texto seleccionable en el certificado. Revisa el PDF escaneado manualmente.');
      const files = readable.map(page => ({path:`pages/${page.page}.txt`,content:page.layoutText || page.text}));
      const taskId = crypto.randomUUID();
      const spanish = isSpanishAccreditation(readable, options?.jurisdiction);
      const prompt = buildAccreditationPrompt(en, spanish);
      const title = spanish
        ? (en ? 'ROLECE / DEUC analysis' : 'Análisis ROLECE / DEUC')
        : (en ? 'RUP certificate analysis' : 'Análisis del certificado RUP');
      const result = await agentService.runTask({task_id:taskId,queue_scope_id:`rup-analysis-${taskId}`,title,prompt,files,max_retries:0,initial_stage:'rup-analysis',secop_safe_tools:true,active_tools:['read','grep','find','ls'],before_tool_call:async ({toolCall})=>{if(toolCall?.name==='write'||toolCall?.name==='edit')throw Error('El análisis del RUP es de solo lectura.');}});
      if (hash(certificate.readPdf()) !== digest) throw Error(en ? 'The certificate changed during analysis. Analyze the current certificate again.' : 'El certificado cambió durante el análisis. Analiza de nuevo el certificado actual.');
      const raw = String(result.assistant_text || '').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
      let entries; try { entries = JSON.parse(raw); } catch { throw Error(en ? 'The agent did not return a readable result. Try again.' : 'El agente no devolvió un resultado legible. Inténtalo de nuevo.'); }
      if (!Array.isArray(entries)) throw Error(en ? 'The agent did not return a list of suggestions.' : 'El agente no devolvió una lista de sugerencias.');
      const suggestions = [], seen = new Set(); let rejectedCount = 0;
      for (const item of entries) {
        const label = typeof item?.label === 'string' ? item.label.trim() : '';
        const value = typeof item?.value === 'string' ? item.value.trim() : '';
        const quote = typeof item?.quote === 'string' ? item.quote.trim() : '';
        const page = Number(item?.page), source = pages.find(entry => entry.page === page);
        if (!label || !value || !quote || !Number.isInteger(page) || !source || !quoteContainsValue(quote,value) || ![source.text,source.layoutText].some(text => normalize(text).includes(normalize(quote)))) { rejectedCount++; continue; }
        const key = JSON.stringify([label,value,page,quote]); if (seen.has(key)) continue; seen.add(key);
        suggestions.push({label,value,page,quote});
      }
      return {suggestions,rejectedCount,pagesWithoutText:pages.filter(page=>!(page.text||page.layoutText||'').trim()).map(page=>page.page)};
    } finally { running = false; }
  }
  return { analyze };
}
module.exports = { createRupAgentService, isSpanishAccreditation, buildAccreditationPrompt };
