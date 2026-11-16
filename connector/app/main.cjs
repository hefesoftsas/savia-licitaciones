const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const { homedir, tmpdir } = require('node:os');
const { ConnectorController } = require('./controller.cjs');
const { startSecopChallengeBridge: createSecopChallengeBridge } = require('./secop-challenge-bridge.cjs');

const bundle = process.env.SAVIA_CONNECTOR_BUNDLE || join(process.resourcesPath, 'runner-bundle');
// Reuse Electron's embedded Node in a separate headless process.
const node = process.execPath;
let window;
let controller;
let closing = false;
let closeRequest;
let stopRequest;
let challengeServer;
const allowedErrors = new Set(['invalid_address', 'invalid_code', 'invalid_name', 'busy', 'not_paired',
  'pair_timeout', 'connection_failed', 'operation_cancelled', 'start_failed', 'stop_failed']);
function text(es, en) { return app.getLocale().startsWith('en') ? en : es; }

async function formatSecopCookies(secopSession) {
  const cookies = await secopSession.cookies.get({ domain: 'secop.gov.co' });
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

function openSecopChallengeWindow({ url, title, signal }) {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve({ ok: false, error: 'cancelled' }); return; }
    const secopSession = session.fromPartition('persist:secop');
    let settled = false;
    let challengeWindow;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      secopSession.removeListener('will-download', onDownload);
      signal?.removeEventListener('abort', onAbort);
      if (challengeWindow && !challengeWindow.isDestroyed()) challengeWindow.close();
      resolve(payload);
    };
    const onAbort = () => finish({ ok: false, error: 'cancelled' });
    const onDownload = (_event, item, webContents) => {
      if (!challengeWindow || challengeWindow.isDestroyed() || webContents !== challengeWindow.webContents) return;
      const targetPath = join(tmpdir(), `savia-secop-${randomUUID()}`);
      item.setSavePath(targetPath);
      item.once('done', async (_doneEvent, state) => {
        if (state !== 'completed') { finish({ ok: false, error: 'download_failed' }); return; }
        const cookieHeader = await formatSecopCookies(secopSession).catch(() => '');
        finish({ ok: true, filePath: targetPath, cookieHeader });
      });
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    secopSession.on('will-download', onDownload);
    challengeWindow = new BrowserWindow({
      parent: window && !window.isDestroyed() ? window : undefined,
      width: 960, height: 740,
      title: text(`Savia Conector — Verificación SECOP (${title || 'Documento'})`, `Savia Connector — SECOP Verification (${title || 'Document'})`),
      autoHideMenuBar: true,
      webPreferences: { session: secopSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    challengeWindow.on('closed', async () => {
      if (settled) return;
      const cookieHeader = await formatSecopCookies(secopSession).catch(() => '');
      finish(cookieHeader ? { ok: true, cookieHeader } : { ok: false, error: 'cancelled' });
    });
    void challengeWindow.loadURL(url).catch(() => finish({ ok: false, error: 'load_failed' }));
  });
}

async function startSecopChallengeBridge() {
  const bridge = await createSecopChallengeBridge({ openWindow: openSecopChallengeWindow });
  challengeServer = bridge.server;
  return { url: bridge.url, token: bridge.token };
}

async function confirmStop() {
  const result = await dialog.showMessageBox(window, {
    type: 'question',
    buttons: [text('Seguir conectado', 'Stay connected'), text('Detener', 'Stop')],
    defaultId: 0, cancelId: 0,
    message: text('¿Detener Savia Conector?', 'Stop Savia Connector?'),
    detail: text('Las tareas en ejecución pueden interrumpirse.', 'Running tasks may be interrupted.'),
  });
  return result.response === 1;
}
function requestClose() {
  if (closeRequest) return closeRequest;
  closeRequest = (async () => {
    if (controller?.child && !await confirmStop()) return;
    try {
      await controller?.shutdown();
      challengeServer?.close();
      closing = true;
      app.quit();
    } catch {
      if (controller) controller.closing = false;
      await dialog.showMessageBox(window, {
        type: 'error',
        message: text('No se pudo detener el conector.', 'The connector could not be stopped.'),
        detail: text('Espera unos segundos y vuelve a intentarlo.', 'Wait a few seconds and try again.'),
      });
    }
  })().finally(() => { closeRequest = null; });
  return closeRequest;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.show();
    window?.focus();
  });
  app.on('before-quit', event => {
    if (closing) return;
    event.preventDefault();
    void requestClose();
  });
  app.whenReady().then(async () => {
    app.setName('Savia Conector');
    const bridge = await startSecopChallengeBridge();
    controller = new ConnectorController({
      node, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', SAVIA_CONNECTOR_UI_URL: bridge.url, SAVIA_CONNECTOR_UI_TOKEN: bridge.token }, cli: join(bundle, 'runner', 'cli.mjs'), config: join(homedir(), '.savia', 'runner.json'), cwd: bundle,
      onChange: state => {
        if (window && !window.isDestroyed()) window.webContents.send('connector:status', state);
      },
    });
    window = new BrowserWindow({
      width: 500, height: 670, minWidth: 430, minHeight: 580, title: 'Savia Conector', autoHideMenuBar: true,
      backgroundColor: '#f6f8f6',
      webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const invoke = (name, callback) => ipcMain.handle(name, async (event, ...args) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('invalid_sender');
      try { return { ok: true, value: await callback(...args) }; }
      catch (error) { return { ok: false, error: allowedErrors.has(error.message) ? error.message : 'operation_failed' }; }
    });
    invoke('connector:status', () => controller.snapshot());
    invoke('connector:version', () => app.getVersion());
    invoke('connector:pair', input => controller.pair(input));
    invoke('connector:start', () => controller.start());
    invoke('connector:stop', () => {
      if (stopRequest) return stopRequest;
      stopRequest = (async () => {
        if (controller.child && await confirmStop()) return controller.stop();
        return controller.snapshot();
      })().finally(() => { stopRequest = null; });
      return stopRequest;
    });
    invoke('connector:open-web', () => {
      const server = controller.snapshot().server;
      if (server) return shell.openExternal(server);
    });
    invoke('connector:open-downloads', () => {
      const server = controller.snapshot().server;
      if (server) return shell.openExternal(new URL('/?view=runners', server).href);
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('close', event => {
      if (closing) return;
      event.preventDefault();
      void requestClose();
    });
    await controller.initialize();
    await controller.refreshExternalStatus();
    const statusTimer = setInterval(() => void controller.refreshExternalStatus(), 3000);
    statusTimer.unref();
    await window.loadFile(join(__dirname, 'index.html'));
  }).catch(() => {
    dialog.showErrorBox('Savia Conector', text('No se pudo abrir el conector. Vuelve a instalar la aplicación.', 'The connector could not open. Please reinstall the app.'));
    void requestClose();
  });
  app.on('window-all-closed', () => { if (!closing) void requestClose(); });
}
