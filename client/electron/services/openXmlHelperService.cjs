const { spawn, execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mime = require('mime-types');
const { compactLogError, createDeveloperLogger } = require('../utils/developerLog.cjs');
const { localizeExportFormat } = require('../utils/localizeExportFormat.cjs');
const { detectLocaleFromConfig } = require('../utils/localeMessages.cjs');
const {
  getOpenXmlHelperDebugExecutablePath,
  getOpenXmlHelperProjectPath,
  getOpenXmlJobDir,
  getOpenXmlJobsDir,
  getBundledOpenXmlHelperPath,
  getWorkspaceDir,
} = require('../utils/paths.cjs');
const { buildChromeAssets, pruneChromeAssets } = require('./chromeAssetService.cjs');

const SIGNAL_VERSION = 1;
const PING_TIMEOUT_MS = 15000;
const JOB_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const TEMPLATE_PREVIEW_FILE = 'preview.docx';
const TEMPLATE_PREVIEW_TIMEOUT_MS = 120000;
const TEMPLATE_PREVIEW_ASSET_ROOT = 'preview-assets';
const TEMPLATE_PREVIEW_CACHE_SIZE = 5;
const BLIND_CHECK_TIMEOUT_MS = 10 * 60 * 1000;
// Repair rewrites, validates, and rechecks a copy, taking more than twice as long as inspection alone.
const BLIND_CHECK_FIX_TIMEOUT_MS = 15 * 60 * 1000;
const BLIND_CHECK_PROGRESS_INTERVAL_MS = 300;

/** Generate task IDs from a timestamp plus a short random string. */
function createJobId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${stamp}-${crypto.randomBytes(2).toString('hex')}`;
}

/** Preserve upstream cancellation reasons and add a stable error code when no reason was provided. */
function getAbortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('Open XML 任务已取消');
  error.code = 'TASK_CANCELLED';
  return error;
}

/**
 * One independent helper process and its task queue.
 * Timeout/cancellation terminate the entire helper, so unrelated uses require separate instances;
 * otherwise a template-preview timeout would also kill an active export.
 */
function createHelperRunner({ app, writeLog, ensureExecutable, executablePath, name }) {
  let child = null;
  let stdoutBuffer = '';
  let queue = Promise.resolve();
  let terminationPromise = null;
  const pending = new Map();

  function log(event, payload = {}) {
    writeLog(event, { helper: name, ...payload });
  }

  function rejectPending(error) {
    for (const [jobId, waiter] of pending.entries()) {
      waiter.cleanup?.();
      waiter.reject(error);
      pending.delete(jobId);
    }
  }

  function handleStdoutChunk(chunk) {
    stdoutBuffer += String(chunk || '');
    let newline = stdoutBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = stdoutBuffer.slice(0, newline).replace(/\r$/, '');
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (line.trim()) {
        handleSignalLine(line);
      }
      newline = stdoutBuffer.indexOf('\n');
    }
  }

  function handleSignalLine(line) {
    let signal;
    try {
      signal = JSON.parse(line);
    } catch (error) {
      log('openxml.signal.parse_error', { line, error: compactLogError(error) });
      return;
    }

    if (signal?.v !== SIGNAL_VERSION || signal?.type !== 'done') {
      log('openxml.signal.ignored', { line });
      return;
    }

    const jobId = String(signal.job || '').trim();
    const waiter = pending.get(jobId);
    if (!waiter) {
      log('openxml.signal.unmatched', { job: jobId });
      return;
    }

    waiter.cleanup?.();
    pending.delete(jobId);
    waiter.resolve({ ok: signal.ok === true });
  }

  /** Start the compiled or packaged helper process. */
  function spawnHelper() {
    const workspace = getWorkspaceDir(app);
    fs.mkdirSync(getOpenXmlJobsDir(app), { recursive: true });

    const command = executablePath || (app.isPackaged
      ? getBundledOpenXmlHelperPath(app)
      : getOpenXmlHelperDebugExecutablePath());
    const args = ['--workspace', workspace];

    if (!fs.existsSync(command)) {
      throw new Error(`找不到 Open XML 助手：${command}`);
    }

    const next = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        DOTNET_NOLOGO: '1',
      },
    });

    next.stdout.setEncoding('utf8');
    next.stderr.setEncoding('utf8');
    next.stdout.on('data', handleStdoutChunk);
    next.stderr.on('data', (chunk) => {
      log('openxml.helper.stderr', { message: String(chunk || '').trim() });
    });
    next.on('error', (error) => {
      log('openxml.helper.spawn_error', { error: compactLogError(error) });
      if (child === next) {
        child = null;
        stdoutBuffer = '';
        rejectPending(error);
      }
    });
    next.on('exit', (code, signal) => {
      log('openxml.helper.exit', { code, signal });
      if (child === next) {
        child = null;
        stdoutBuffer = '';
        rejectPending(new Error('Open XML 助手已退出'));
      }
    });

    child = next;
    log('openxml.helper.started', { command, packaged: Boolean(app.isPackaged) });
  }

  async function ensureStarted() {
    if (child && !child.killed) {
      return;
    }
    await ensureExecutable();
    if (child && !child.killed) return;
    spawnHelper();
  }

  /** Terminate the current helper and wait for exit; restart it for the next task. */
  async function terminateHelper() {
    if (terminationPromise) return terminationPromise;
    const current = child;
    child = null;
    stdoutBuffer = '';
    if (!current) return;

    terminationPromise = new Promise((resolve) => {
      let settled = false;
      const timers = [];
      const finish = () => {
        if (settled) return;
        settled = true;
        for (const timer of timers) clearTimeout(timer);
        resolve();
      };
      if (current.exitCode !== null || current.signalCode !== null) {
        finish();
        return;
      }
      current.once('exit', finish);
      current.once('error', finish);
      // Force-kill after two seconds but still wait for actual exit; releasing early lets deletion collide with open file handles.
      timers.push(setTimeout(() => {
        try { current.kill('SIGKILL'); } catch {}
      }, 2000));
      // Final fallback for unreapable processes; deletion-side termination of locking processes handles leftover file handles.
      timers.push(setTimeout(finish, 15000));
      try {
        current.stdin?.end();
      } catch {}
      try {
        current.kill();
      } catch {
        finish();
      }
    });
    try {
      await terminationPromise;
    } finally {
      terminationPromise = null;
    }
  }

  function sendRun(jobId) {
    if (!child?.stdin || child.stdin.destroyed) {
      throw new Error('Open XML 助手尚未就绪');
    }
    child.stdin.write(`${JSON.stringify({ v: SIGNAL_VERSION, type: 'run', job: jobId })}\n`, 'utf8');
  }

  function readResult(jobId) {
    const resultPath = path.join(getOpenXmlJobDir(app, jobId), 'result.json');
    const raw = fs.readFileSync(resultPath, 'utf8');
    return JSON.parse(raw);
  }

  function enqueue(work, signal) {
    let started = false;
    const execute = async () => {
      started = true;
      if (signal?.aborted) throw getAbortError(signal);
      return work();
    };
    const run = queue.then(execute, execute);
    queue = run.then(() => undefined, () => undefined);
    if (!signal) return run;

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal.removeEventListener('abort', onAbort);
      const settle = (handler, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        handler(value);
      };
      const onAbort = () => {
        if (!started) settle(reject, getAbortError(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
      run.then(
        (value) => settle(resolve, value),
        (error) => settle(reject, error),
      );
    });
  }

  /** Write the task directory, send run, and wait for done; cancellation or timeout terminates the current helper. */
  async function runJob({ action, request = {}, prepare, timeoutMs = PING_TIMEOUT_MS, signal } = {}) {
    const jobAction = String(action || '').trim();
    if (!jobAction) {
      throw new Error('缺少 action');
    }
    if (signal?.aborted) throw getAbortError(signal);

    return enqueue(async () => {
      const jobId = createJobId();
      if (!JOB_ID_PATTERN.test(jobId)) {
        throw new Error(`任务编号不合法：${jobId}`);
      }

      const jobDir = getOpenXmlJobDir(app, jobId);
      fs.mkdirSync(jobDir, { recursive: true });
      fs.writeFileSync(path.join(jobDir, 'request.json'), `${JSON.stringify({ ...request, action: jobAction }, null, 2)}\n`, 'utf8');
      if (typeof prepare === 'function') {
        await prepare(jobDir);
      }
      if (signal?.aborted) throw getAbortError(signal);

      await ensureStarted();
      if (signal?.aborted) {
        await terminateHelper();
        throw getAbortError(signal);
      }

      const completionSignal = await new Promise((resolve, reject) => {
        let timer;
        const cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener?.('abort', onAbort);
        };
        const stopAndReject = (error, event) => {
          if (!pending.has(jobId)) return;
          pending.delete(jobId);
          cleanup();
          log(event, { job: jobId, action: jobAction });
          void terminateHelper().then(
            () => reject(error),
            () => reject(error),
          );
        };
        const onAbort = () => stopAndReject(getAbortError(signal), 'openxml.job.cancelled');
        timer = setTimeout(() => {
          stopAndReject(new Error('Open XML 助手等待完成超时'), 'openxml.job.timeout');
        }, timeoutMs);
        pending.set(jobId, { resolve, reject, cleanup });
        signal?.addEventListener?.('abort', onAbort, { once: true });
        if (signal?.aborted) {
          onAbort();
          return;
        }
        try {
          sendRun(jobId);
        } catch (error) {
          cleanup();
          pending.delete(jobId);
          reject(error);
        }
      });

      let result;
      try {
        result = readResult(jobId);
      } catch (error) {
        if (!completionSignal.ok) {
          throw new Error('Open XML 助手执行失败，且没有 result.json');
        }
        throw error;
      }

      if (!result?.ok) {
        throw new Error(String(result?.error || 'Open XML 助手执行失败'));
      }

      return { ...result, jobDir };
    }, signal);
  }

  /** End the helper process and reject unfinished tasks. */
  async function close() {
    const waiters = [...pending.values()];
    pending.clear();
    for (const waiter of waiters) waiter.cleanup?.();
    await terminateHelper();
    for (const waiter of waiters) waiter.reject(new Error('Open XML 助手已关闭'));
  }

  return { runJob, close };
}

/** Start the Open XML helper, submit actions through task directories, and wait for completion. */
function createOpenXmlHelperService({ app, configStore, executablePath } = {}) {
  let debugBuildPromise = null;
  let previewAssetPromise = null;
  let previewActive = null;
  let previewPending = null;
  // Number of calls currently using task directories; storage cleanup skips active helper tasks based on this.
  let activeJobCount = 0;
  // Template previews switch among configurations; a small recent-result cache avoids repeated generation.
  const previewCache = new Map();
  const logger = createDeveloperLogger({
    app,
    config: configStore?.load?.() || {},
    moduleName: 'openxml-helper',
    name: 'openxml-helper',
  });

  function writeLog(event, payload = {}) {
    logger.write(event, payload);
  }

  /** Compile the helper asynchronously in development to avoid blocking Main on first preview. */
  function buildDebugHelper() {
    if (debugBuildPromise) return debugBuildPromise;
    const projectPath = getOpenXmlHelperProjectPath();
    if (!fs.existsSync(projectPath)) {
      return Promise.reject(new Error(`找不到 Open XML 助手工程：${projectPath}`));
    }

    debugBuildPromise = new Promise((resolve, reject) => {
      execFile('dotnet', ['build', projectPath, '-nologo', '-v', 'q'], {
        encoding: 'utf8',
        windowsHide: true,
        shell: false,
        timeout: 180000,
        env: {
          ...process.env,
          DOTNET_NOLOGO: '1',
        },
      }, (error) => {
        if (error) {
          debugBuildPromise = null;
          reject(error);
          return;
        }
        resolve();
      });
    });
    return debugBuildPromise;
  }

  async function ensureExecutable() {
    if (!app.isPackaged && !executablePath) await buildDebugHelper();
  }

  const runner = createHelperRunner({ app, writeLog, ensureExecutable, executablePath, name: 'main' });
  const previewRunner = createHelperRunner({ app, writeLog, ensureExecutable, executablePath, name: 'preview' });
  // Large blind-bid inspections consume memory and may be cancelled; use a separate process without affecting export/preview queues.
  const blindCheckRunner = createHelperRunner({ app, writeLog, ensureExecutable, executablePath, name: 'blind-check' });

  function ping() {
    return runner.runJob({ action: 'ping', timeoutMs: PING_TIMEOUT_MS });
  }

  /** Agent-submitted tasks remain active until callers finish reading their task directories. */
  async function runTrackedJob(request) {
    activeJobCount += 1;
    try {
      return await runner.runJob(request);
    } finally {
      activeJobCount -= 1;
    }
  }

  /**
   * Synchronize sample images into a shared workspace directory.
   * Images remain unchanged across previews; avoid redundant per-task disk writes by updating only changed source files.
   */
  function syncPreviewAssets() {
    if (previewAssetPromise) return previewAssetPromise;
    previewAssetPromise = (async () => {
      const sourceDir = path.join(app.getAppPath(), 'assets', 'content-template-preview');
      const targetDir = path.join(getWorkspaceDir(app), TEMPLATE_PREVIEW_ASSET_ROOT, 'assets');
      fs.mkdirSync(targetDir, { recursive: true });

      const sources = fs.readdirSync(sourceDir).filter((item) => item.toLowerCase().endsWith('.webp'));
      for (const name of sources) {
        const source = path.join(sourceDir, name);
        const target = path.join(targetDir, name);
        const sourceStat = fs.statSync(source);
        const targetStat = fs.existsSync(target) ? fs.statSync(target) : null;
        if (targetStat && targetStat.size === sourceStat.size && targetStat.mtimeMs >= sourceStat.mtimeMs) {
          continue;
        }
        fs.copyFileSync(source, target);
      }

      const known = new Set(sources);
      for (const name of fs.readdirSync(targetDir)) {
        if (!known.has(name)) fs.rmSync(path.join(targetDir, name), { force: true });
      }
      return TEMPLATE_PREVIEW_ASSET_ROOT;
    })().catch((error) => {
      previewAssetPromise = null;
      throw error;
    });
    return previewAssetPromise;
  }

  function readPreviewCache(key) {
    if (!previewCache.has(key)) return null;
    const entry = previewCache.get(key);
    previewCache.delete(key);
    previewCache.set(key, entry);
    return entry;
  }

  function writePreviewCache(key, entry) {
    previewCache.set(key, entry);
    while (previewCache.size > TEMPLATE_PREVIEW_CACHE_SIZE) {
      previewCache.delete(previewCache.keys().next().value);
    }
  }

  /**
   * Pass template samples to OpenXmlHelper for DOCX generation.
   * Return a content fingerprint and paragraph-role map: the fingerprint detects real sample changes
   * (identical bytes in a new array would otherwise reopen the editor unnecessarily),
   * while roles let previews locate paragraphs and apply incremental updates instead of regenerating everything.
   */
  function renderRestrictedHtmlDocx(html, exportFormat, options = {}) {
    // assetRoot lets callers use their own image directory (developer layout tests use real generated images
    // that must not share the synchronized/cleaned template resource directory); otherwise use template sample assets.
    const assetRoot = typeof options.assetRoot === 'string' ? options.assetRoot.trim() : '';
    const key = crypto.createHash('sha256')
      .update(html).update('\0').update(JSON.stringify(exportFormat)).update('\0').update(assetRoot)
      .digest('hex');
    const cached = readPreviewCache(key);
    if (cached) {
      settleSupersededPreview({ key, ...cached });
      return Promise.resolve({ key, ...cached });
    }
    if (previewActive?.key === key) {
      settleSupersededPreview(previewActive.promise);
      return previewActive.promise;
    }
    if (previewPending?.key === key) {
      return previewPending.promise;
    }

    const request = { key, html, exportFormat, assetRoot };
    if (!previewActive) {
      return startPreview(request);
    }

    const next = createPendingPreview(request);
    if (previewPending) previewPending.resolve(next.promise);
    previewPending = next;
    return next.promise;
  }

  /** Create the latest preview request not yet in the Open XML queue. */
  function createPendingPreview(request) {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { ...request, promise, resolve, reject };
  }

  /** If results already exist for this configuration, resolve superseded waiting calls with them normally. */
  function settleSupersededPreview(result) {
    if (!previewPending) return;
    const superseded = previewPending;
    previewPending = null;
    superseded.resolve(result);
  }

  /** Start one preview; on completion enqueue only the most recent waiting configuration. */
  function startPreview(request) {
    const promise = createRestrictedHtmlDocx(request.html, request.exportFormat, { assetRoot: request.assetRoot })
      .then((rendered) => ({ key: request.key, ...rendered }));
    const task = { key: request.key, promise };
    previewActive = task;
    promise.then(
      (result) => {
        writePreviewCache(task.key, { bytes: result.bytes, roles: result.roles });
        finishPreview(task);
      },
      () => finishPreview(task),
    );
    return promise;
  }

  /** Finish the running preview and promote the single retained waiting request. */
  function finishPreview(task) {
    if (previewActive !== task) return;
    previewActive = null;
    const next = previewPending;
    previewPending = null;
    if (!next) return;
    startPreview(next).then(next.resolve, next.reject);
  }

  /**
   * Generate Word; stage external workspace images in the helper workspace as needed without changing originals.
   * Extensions declare staged image types, used for original-byte embedding only when headers are unrecognized; report unexportable images in imageWarnings.
   */
  async function createRestrictedHtmlDocx(html, exportFormat, options = {}) {
    exportFormat = localizeExportFormat(exportFormat, detectLocaleFromConfig(configStore));
    let assetRoot = options.assetRoot?.trim() || (options.copyAssets ? getWorkspaceDir(app) : await syncPreviewAssets());
    let temporaryAssets;
    let result;
    const assetTypes = {};
    activeJobCount += 1;
    try {
      if (options.copyAssets) {
        const workspace = getWorkspaceDir(app);
        fs.mkdirSync(workspace, { recursive: true });
        temporaryAssets = fs.mkdtempSync(path.join(workspace, 'restricted-html-assets-'));
        const $ = require('cheerio').load(require('../utils/saviaMarkup.cjs').normalizeSaviaMarkup(html), null, false);
        const references = new Set($('img').toArray().map(element => $(element).attr('data-sv-asset-ref')));
        for (const reference of references) {
          if (!reference || reference.includes('\\') || path.isAbsolute(reference) || reference.includes(':') || reference.split('/').includes('..')) {
            throw new Error('Word 配图引用必须是图片根目录内的相对路径');
          }
          const target = path.join(temporaryAssets, reference);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          const bytes = options.assets?.get(reference);
          if (bytes) fs.writeFileSync(target, bytes);
          else fs.copyFileSync(path.join(assetRoot, reference), target);
          const type = mime.lookup(reference);
          if (type && type.startsWith('image/')) assetTypes[reference] = type;
        }
        assetRoot = path.basename(temporaryAssets);
      }
      // Header/footer decorations: rasterize SVG to workspace PNG, then embed as anchored floating images in C#.
      // Paragraph shading cannot draw gradients or diagonal cuts; decorations require images.
      const chrome = await buildChromeAssets(app, exportFormat?.page);
      pruneChromeAssets(app, [chrome.header, chrome.footer]);
      result = await (options.wholeDocument ? runner : previewRunner).runJob({
        action: 'render-restricted-html-docx',
        request: {
          html,
          whole_document: Boolean(options.wholeDocument),
          export_format: exportFormat,
          asset_root: assetRoot,
          asset_types: assetTypes,
          chrome_assets: {
            root: chrome.assetRoot,
            header: chrome.header,
            footer: chrome.footer,
            header_height_cm: chrome.layout.headerHeightCm,
            footer_height_cm: chrome.layout.footerHeightCm,
            footer_top_cm: chrome.layout.footerTopCm,
            footer_distance_cm: chrome.layout.footerDistanceCm,
            header_distance_cm: chrome.layout.headerDistanceCm,
            margin_top_cm: chrome.layout.marginTopCm,
            margin_bottom_cm: chrome.layout.marginBottomCm,
            text_layout: chrome.textLayout,
          },
        },
        // Full-document conversion uses the production task queue, avoiding the sample-preview queue and its two-minute timeout.
        timeoutMs: options.wholeDocument ? 30 * 60 * 1000 : TEMPLATE_PREVIEW_TIMEOUT_MS,
      });

      return {
        bytes: new Uint8Array(fs.readFileSync(path.join(result.jobDir, TEMPLATE_PREVIEW_FILE))),
        roles: Array.isArray(result.paragraphRoles) ? result.paragraphRoles : [],
        imageWarnings: result.imageWarnings,
      };
    } finally {
      // rmSync can throw for locked directories; return the active count in an inner finally so task completion always releases it.
      try {
        const jobsRoot = path.resolve(getOpenXmlJobsDir(app));
        if (result) {
          const jobDir = path.resolve(result.jobDir);
          if (path.dirname(jobDir) === jobsRoot) fs.rmSync(jobDir, { recursive: true, force: true });
        }
        if (temporaryAssets && path.dirname(temporaryAssets) === path.resolve(getWorkspaceDir(app))) {
          fs.rmSync(temporaryAssets, { recursive: true, force: true });
        }
      } finally {
        activeJobCount -= 1;
      }
    }
  }

  /** Merge template chapters from immutable in-memory snapshots into a generated Word document. */
  async function mergeTemplateChapters(documentBytes, templateBytes, chapterIds) {
    const workspace = getWorkspaceDir(app);
    fs.mkdirSync(workspace, { recursive: true });
    const directory = fs.mkdtempSync(path.join(workspace, 'template-merge-'));
    let jobDir;
    activeJobCount += 1;
    try {
      fs.writeFileSync(path.join(directory, 'base.docx'), documentBytes);
      fs.writeFileSync(path.join(directory, 'template.docx'), templateBytes);
      const relative = path.basename(directory);
      await runner.runJob({
        action: 'merge-template-chapters',
        request: { input: `${relative}/base.docx`, template: `${relative}/template.docx`, output: `${relative}/merged.docx`, chapter_ids: chapterIds },
        prepare: dir => { jobDir = dir; },
        timeoutMs: 30 * 60 * 1000,
      });
      return fs.readFileSync(path.join(directory, 'merged.docx'));
    } finally {
      try {
        if (jobDir && path.dirname(path.resolve(jobDir)) === path.resolve(getOpenXmlJobsDir(app))) fs.rmSync(jobDir, { recursive: true, force: true });
        fs.rmSync(directory, { recursive: true, force: true });
      } finally { activeJobCount -= 1; }
    }
  }

  /**
   * Shared execution for blind-bid inspection and repair. Poll helper progress.json in the task directory and invoke callbacks.
   * Terminate the process after each run so an idle helper does not retain large-document memory.
   */
  async function runBlindCheckJob({ action, request, outputName, timeoutMs }, { signal, onProgress } = {}) {
    let jobDir = '';
    let timer = null;
    let lastProgress = '';
    const pollProgress = () => {
      try {
        const raw = fs.readFileSync(path.join(jobDir, 'progress.json'), 'utf8');
        if (raw === lastProgress) return;
        lastProgress = raw;
        const progress = JSON.parse(raw);
        onProgress?.({ frac: Number(progress.frac) || 0, label: String(progress.label || '') });
      } catch {
        // The progress file may briefly disappear during replacement; read again on the next poll.
      }
    };
    activeJobCount += 1;
    try {
      const result = await blindCheckRunner.runJob({
        action,
        request,
        prepare: (dir) => {
          jobDir = dir;
          timer = setInterval(pollProgress, BLIND_CHECK_PROGRESS_INTERVAL_MS);
        },
        timeoutMs,
        signal,
      });
      return JSON.parse(fs.readFileSync(path.join(result.jobDir, String(result.output || outputName)), 'utf8'));
    } finally {
      try {
        if (timer) clearInterval(timer);
        await blindCheckRunner.close().catch(() => undefined);
        if (jobDir && path.dirname(path.resolve(jobDir)) === path.resolve(getOpenXmlJobsDir(app))) {
          fs.rmSync(jobDir, { recursive: true, force: true });
        }
      } finally {
        activeJobCount -= 1;
      }
    }
  }

  function runBlindCheck(request, options) {
    return runBlindCheckJob({ action: 'blind-check-inspect', request, outputName: 'blind-check-result.json', timeoutMs: BLIND_CHECK_TIMEOUT_MS }, options);
  }

  /** Blind-bid automatic repair writes and rechecks a workspace copy without modifying the original. */
  function runBlindCheckFix(request, options) {
    return runBlindCheckJob({ action: 'blind-check-fix', request, outputName: 'blind-check-fix-result.json', timeoutMs: BLIND_CHECK_FIX_TIMEOUT_MS }, options);
  }

  /** Blind-bid AI review exports bid structure by paragraph number: body, headers/footers, section/page numbering, and image list. */
  function runBlindCheckDump(request, options) {
    return runBlindCheckJob({ action: 'blind-check-dump', request, outputName: 'blind-check-dump.json', timeoutMs: BLIND_CHECK_TIMEOUT_MS }, options);
  }

  /** Blind-bid AI review applies agent text edits to the repair copy, validates, replaces it, and returns updated bid structure. */
  function runBlindCheckEdit(request, options) {
    return runBlindCheckJob({ action: 'blind-check-edit', request, outputName: 'blind-check-edit-result.json', timeoutMs: BLIND_CHECK_FIX_TIMEOUT_MS }, options);
  }

  /** End the blind-bid helper process on app exit. */
  function closeBlindCheck() {
    return blindCheckRunner.close();
  }

  /** End the helper process and reject unfinished tasks. */
  async function close() {
    const queuedPreview = previewPending;
    previewPending = null;
    previewActive = null;
    previewCache.clear();
    queuedPreview?.reject(new Error('Open XML 助手已关闭'));
    await Promise.all([runner.close(), previewRunner.close()]);
  }

  if (!app.isPackaged && !executablePath) {
    void buildDebugHelper().catch((error) => {
      writeLog('openxml.helper.build_error', { error: compactLogError(error) });
    });
  }

  return {
    ping,
    runJob: runTrackedJob,
    hasActiveJobs: () => activeJobCount > 0,
    renderRestrictedHtmlDocx,
    createRestrictedHtmlDocx,
    mergeTemplateChapters,
    runBlindCheck,
    runBlindCheckFix,
    runBlindCheckDump,
    runBlindCheckEdit,
    closeBlindCheck,
    close,
  };
}

module.exports = {
  createOpenXmlHelperService,
};
