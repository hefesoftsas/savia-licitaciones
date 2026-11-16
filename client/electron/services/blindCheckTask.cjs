const { collectImageColorFacts } = require('./blindCheckImageColor.cjs');
const { agentActivityText, runBlindCheckReviewAgent } = require('./blindCheckAgent.cjs');

function now() {
  return new Date().toISOString();
}

/** Convert the helper's snake_case result into the UI structure; g{index} group IDs match AI review references. */
function mapReport(report) {
  const summary = report?.summary || {};
  const stats = report?.stats || {};
  return {
    summary: {
      high: Number(summary.high || 0),
      medium: Number(summary.medium || 0),
      low: Number(summary.low || 0),
      total: Number(summary.total || 0),
    },
    stats: {
      paragraphs: Number(stats.paragraphs || 0),
      bodyParagraphs: Number(stats.body_paragraphs || 0),
      tableParagraphs: Number(stats.table_paragraphs || 0),
      tables: Number(stats.tables || 0),
      sections: Number(stats.sections || 0),
      tocEntries: Number(stats.toc_entries || 0),
      headings: Number(stats.headings || 0),
      headingSources: stats.heading_sources || {},
      coverParagraphs: Number(stats.cover_paragraphs || 0),
      images: Number(stats.images || 0),
      imageFormats: stats.image_formats || {},
      vectorImages: Number(stats.vector_images || 0),
      rulesChecked: Number(stats.rules_checked || 0),
      durationMs: Number(stats.duration_ms || 0),
    },
    ruleErrors: Array.isArray(report?.rule_errors) ? report.rule_errors.map(String) : [],
    groups: (Array.isArray(report?.groups) ? report.groups : []).map((group, index) => ({
      id: `g${index}`,
      ruleId: String(group.rule_id || ''),
      ruleTitle: String(group.rule_title || ''),
      category: String(group.category || ''),
      severity: String(group.severity || 'low'),
      message: String(group.message || ''),
      candidate: Boolean(group.candidate),
      count: Number(group.count || 0),
      samples: (Array.isArray(group.samples) ? group.samples : []).map((sample) => ({
        where: String(sample.where || ''),
        text: String(sample.text || ''),
        detail: String(sample.detail || ''),
        origin: String(sample.origin || ''),
        hint: String(sample.hint || ''),
      })),
      items: (Array.isArray(group.items) ? group.items : []).map((item) => ({
        where: String(item.where || ''),
        text: String(item.text || ''),
        detail: String(item.detail || ''),
        locator: String(item.locator || ''),
      })),
    })),
  };
}

function reviewSummaryText(review) {
  const failed = review.clauses.filter((clause) => clause.status === 'fail').length;
  const candidates = Object.keys(review.verdicts).length;
  return `AI 复核完成：对照招标条款 ${review.clauses.length} 条（不符合 ${failed} 条），补充问题 ${review.issues.length} 个${candidates ? `，判定候选问题 ${candidates} 项` : ''}。`;
}

/**
 * Run AI review after inspection produces results. Review failure only marks review as failed; programmatic findings remain valid and the task completes normally.
 */
async function runReviewPhase({ agentService, aiService, openXmlHelperService, workspaceStore, input, groups, taskId, logs, progress, updateTask, checkpointTask, taskControl }) {
  const tender = workspaceStore.readPresetTender(input.presetId);
  const base = { inputSignature: input.signature, tenderName: tender?.fileName || '' };
  const startLog = tender ? `AI 正在对照「${tender.fileName}」复核，通常需要几分钟。` : 'AI 正在复核（当前预设没有保存招标文件原文，只能依据预设条款），通常需要几分钟。';
  checkpointTask({ status: 'running', progress, logs: [...logs, startLog] }, { review: { ...base, status: 'running', review: null, error: null, updatedAt: now() } });
  const activityLogs = [...logs, startLog];
  try {
    const { review } = await runBlindCheckReviewAgent({
      agentService,
      aiService,
      openXmlHelperService,
      input,
      groups,
      tender,
      taskId,
      signal: taskControl.signal,
      onActivity(event) {
        const text = agentActivityText(event, '复核结果');
        if (text) updateTask({ status: 'running', progress, logs: [...activityLogs, text] });
      },
    });
    const value = { ...review, hasTender: Boolean(tender), tenderName: tender?.fileName || '' };
    checkpointTask(
      { status: 'success', progress: 100, logs: [...activityLogs, reviewSummaryText(review)], error: undefined },
      { review: { ...base, status: 'success', review: value, error: null, updatedAt: now() } },
    );
  } catch (error) {
    if (taskControl.signal.aborted) throw error;
    const message = error?.message || 'AI 复核失败';
    checkpointTask(
      { status: 'success', progress: 100, logs: [...activityLogs, `AI 复核失败：${message}`], error: undefined },
      { review: { ...base, status: 'error', review: null, error: message, updatedAt: now() } },
    );
  }
}

/**
 * Blind-bid inspection: OpenXmlHelper inspects the workspace document copy in a separate process.
 * Publish progress without persisting it; commit programmatic results first, then run enabled AI review within the same task.
 */
async function runBlindCheckTask({ agentService, aiService, workspaceStore, openXmlHelperService, updateTask, checkpointTask, payload, taskControl }) {
  const input = workspaceStore.prepareCheckInput();
  if (!input.source || !input.signature) throw new Error('请先选择要检查的投标文件');
  // Before starting, the user selects programmatic inspection alone or with AI review; save the choice as the next default.
  const aiReview = payload?.aiReview === true;
  workspaceStore.setAiReviewEnabled(aiReview);

  const logs = [`开始检查「${input.fileName}」，格式预设：${input.presetName}。`];
  const runningResult = {
    status: 'running',
    inputSignature: input.signature,
    presetName: input.presetName,
    summary: null,
    stats: null,
    ruleErrors: [],
    error: null,
    groups: [],
    updatedAt: now(),
  };
  checkpointTask({ status: 'running', progress: 1, logs }, { result: runningResult, review: { status: 'idle', inputSignature: null, tenderName: '', review: null, error: null } });

  let mapped;
  try {
    // Color detection requires pixel decoding absent from the helper; Main samples images and passes its conclusions with the request.
    const imageFacts = input.profile.image.check_color
      ? await collectImageColorFacts(input.sourcePath, {
        signal: taskControl.signal,
        onProgress: (done, total) => {
          if (done === total || done % 10 === 0) updateTask({ status: 'running', progress: 1, logs: [...logs, `正在检查图片颜色（${done}/${total}）`] });
        },
      })
      : [];
    const report = await openXmlHelperService.runBlindCheck({
      source: input.source,
      profile: input.profile,
      sensitive_words: input.sensitiveWords,
      image_facts: imageFacts,
    }, {
      signal: taskControl.signal,
      onProgress: ({ frac, label }) => {
        updateTask({ status: 'running', progress: Math.max(1, Math.min(99, Math.round(frac * 100))), logs: [...logs, label] });
      },
    });
    mapped = mapReport(report);
  } catch (error) {
    if (taskControl.signal.aborted) throw error;
    const message = error?.message || '暗标合规检查失败';
    checkpointTask(
      { status: 'error', progress: 100, logs: [...logs, '检查失败。'], error: message },
      { result: { ...runningResult, status: 'error', error: message, updatedAt: now() } },
    );
    return;
  }

  const summary = mapped.summary.total
    ? `检查完成：高风险 ${mapped.summary.high} 处、中风险 ${mapped.summary.medium} 处、低风险 ${mapped.summary.low} 处。`
    : '检查完成，未发现问题。';
  logs.push(summary);
  const result = { ...runningResult, ...mapped, status: 'success', updatedAt: now() };
  if (!aiReview) {
    checkpointTask(
      { status: 'success', progress: 100, logs, error: undefined },
      { result, review: { status: 'skipped', inputSignature: input.signature, tenderName: '', review: null, error: null, updatedAt: now() } },
    );
    return;
  }
  const { task } = checkpointTask({ status: 'running', progress: 100, logs }, { result });
  await runReviewPhase({
    agentService, aiService, openXmlHelperService, workspaceStore, input,
    groups: mapped.groups, taskId: task.task_id, logs, progress: 100,
    updateTask, checkpointTask, taskControl,
  });
}

module.exports = {
  mapReport,
  runBlindCheckTask,
};
