const brand = require('../../brand.json');
const fs = require('node:fs');
const { load } = require('cheerio');
const { AI_QUEUE_SCOPE_PAUSED } = require('../utils/aiRequestQueue.cjs');
const { createAiBatchGuard, isBatchCancelled } = require('../utils/aiBatchGuard.cjs');

// Programmatic per-item model batches: the AI queue controls concurrency; report individual failures through onError and continue.
// Stop remaining dispatches and throw on consecutive upstream failures; throw pause errors on pause. Callers promptly save completed results.
async function runAiBatch({ items, signal, run, onError = () => {} }) {
  const guard = createAiBatchGuard({ signal });
  const settled = await Promise.allSettled(items.map(async item => {
    try {
      guard.signal.throwIfAborted();
      return await run(item, guard);
    } catch (error) {
      const cancelled = isBatchCancelled(error, guard.signal);
      if (!cancelled) guard.failure(error);
      onError(item, error, { cancelled });
      if (cancelled) throw error;
      return undefined;
    }
  }));
  signal.throwIfAborted();
  if (guard.error) throw guard.error;
  const paused = settled.find(item => item.status === 'rejected' && item.reason?.code === AI_QUEUE_SCOPE_PAUSED);
  if (paused) throw paused.reason;
}

// Make at most two requests in one conversation: follow an unsuitable first result with feedback once, then choose the usable result closest to requirements.
// evaluate returns { accept: true, value }, { value, distance, feedback, reason } for a usable alternative, or { feedback, reason } for unusable output; thrown errors are unusable.
async function requestWithFollowUp({ aiService, guard, logTitle, messages, evaluate }) {
  const conversation = [...messages];
  let fallback = null;
  let reason = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const reply = await aiService.chat({ signal: guard.signal, logTitle, reject_truncated_output: true, messages: conversation });
    guard.signal.throwIfAborted();
    guard.success();
    let result;
    try {
      result = evaluate(reply);
    } catch (error) {
      result = { feedback: `上次输出不可用：${error.message}。请修正后按原要求重新输出。`, reason: error.message };
    }
    if (result.accept) return result.value;
    if (result.value !== undefined && (!fallback || result.distance < fallback.distance)) fallback = result;
    reason = result.reason || result.feedback;
    conversation.push({ role: 'assistant', content: reply }, { role: 'user', content: result.feedback });
  }
  if (fallback) return fallback.value;
  throw new Error(reason);
}

// Top-level elements, savia:block separator comments, and source offsets allow positional assembly without reserializing content.
function topLevelNodes(html) {
  const normalized = require('../utils/saviaMarkup.cjs').normalizeSaviaMarkup(html);
  const $ = load(normalized, { sourceCodeLocationInfo: true }, false);
  const nodes = $.root().contents().toArray().flatMap(node => {
    const location = node.sourceCodeLocation;
    if (!location) return [];
    if (node.type === 'comment') return new RegExp("^\\s*(?:savia|__BRAND_SLUG__):block\\s*$".replaceAll('__BRAND_SLUG__', brand.slug), "").test(node.data) ? [{ kind: 'marker', node, start: location.startOffset, end: location.endOffset }] : [];
    return node.type === 'tag' ? [{ kind: 'element', node, start: location.startOffset, end: location.endOffset }] : [];
  });
  return { $, nodes };
}

// Replace or insert from the end by source offsets, preserving unrelated bytes exactly.
function spliceHtml(html, edits) {
  return [...edits].sort((left, right) => right.start - left.start)
    .reduce((source, edit) => source.slice(0, edit.start) + edit.text + source.slice(edit.end), html);
}

// Existing element IDs to avoid when assigning new prefixed block IDs.
function collectIds($) {
  return new Set($('[id]').map((_index, element) => $(element).attr('id')).get());
}

// Generate a unique section ID within restricted-HTML length limits.
function uniqueId(base, used) {
  const prefix = /^[A-Za-z]/.test(base) ? base.slice(0, 56) : `b_${base}`.slice(0, 56);
  let id = prefix;
  for (let index = 2; used.has(id); index += 1) id = `${prefix}_${index}`;
  used.add(id);
  return id;
}

function writeHtml(file, html) {
  fs.writeFileSync(`${file}.tmp`, html, 'utf8');
  fs.renameSync(`${file}.tmp`, file);
}

module.exports = { runAiBatch, requestWithFollowUp, topLevelNodes, spliceHtml, collectIds, uniqueId, writeHtml };
