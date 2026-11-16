const { spawn } = require('node:child_process');
const { readFile } = require('node:fs/promises');
const { hostname } = require('node:os');

function serverOrigin(server) {
  let url;
  try { url = new URL(server); } catch { throw new Error('invalid_address'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new Error('invalid_address');
  }
  return url.origin;
}

function validatePairing({ server, name, code }) {
  const origin = serverOrigin(server);
  if (typeof code !== 'string' || !/^[a-f0-9]{64}$/.test(code.trim())) throw new Error('invalid_code');
  if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('invalid_name');
  return { server: origin, name: name.trim(), code: code.trim() };
}

// Keep ownership until exit (or a failed spawn), including during shutdown.
// Raw child output is never forwarded. Only structured activity fields are displayed.
function watchChild(child) {
  const record = { child, ended: false, termination: null };
  record.done = new Promise(resolve => {
    const finish = result => {
      if (record.ended) return;
      record.ended = true;
      resolve(result);
    };
    child.once('exit', code => finish({ code }));
    child.on('error', () => { if (!child.pid) finish({ code: null }); });
  });
  return record;
}

function terminate(record) {
  if (record.ended) return record.done;
  if (record.termination) return record.termination;
  record.termination = new Promise((resolve, reject) => {
    const force = setTimeout(() => { record.child.kill('SIGKILL'); }, 8000);
    const deadline = setTimeout(() => reject(new Error('stop_failed')), 12000);
    record.done.then(result => { clearTimeout(force); clearTimeout(deadline); resolve(result); });
    record.child.kill('SIGTERM');
  });
  return record.termination;
}

class ConnectorController {
  constructor({ node, cli, config, cwd, env = process.env, spawnImpl = spawn, readConfig = () => readFile(config, 'utf8'), onChange = () => {} }) {
    Object.assign(this, { node, cli, config, cwd, env, spawnImpl, readConfig, onChange });
    this.child = null;
    this.pairChild = null;
    this.busy = false;
    this.stopping = false;
    this.closing = false;
    this.state = { paired: false, running: false, error: null, server: '', name: hostname() };
  }
  snapshot() { return { ...this.state, busy: this.busy }; }
  emit() { this.onChange(this.snapshot()); }
  async initialize() {
    try {
      const saved = JSON.parse(await this.readConfig());
      if (!saved.runnerId || !saved.token) throw new Error('configuration_unavailable');
      this.state.server = serverOrigin(saved.server);
      this.runnerId = saved.runnerId;
      this.state.paired = true;
    } catch (error) {
      if (error.code !== 'ENOENT') this.state.error = 'configuration_unavailable';
    }
    this.emit();
    return this.snapshot();
  }
  async readExternalStatus() {
    try {
      const status = JSON.parse(await readFile(`${this.config}.status`, 'utf8'));
      if (status.runnerId !== this.runnerId || !Number.isInteger(status.pid) || status.pid <= 0 || Date.now() - status.updatedAt > 15000 || status.updatedAt > Date.now() + 5000) return false;
      process.kill(status.pid, 0);
      return true;
    } catch { return false; }
  }
  async refreshExternalStatus() {
    if (!this.state.paired || this.child || this.closing) return;
    const external = await this.readExternalStatus();
    if (this.child || this.closing) return;
    if (!!this.state.external !== external || !!this.state.running !== external) {
      this.state.external = external;
      this.state.running = external;
      this.emit();
    }
  }
  assertAvailable() {
    if (this.closing) throw new Error('operation_cancelled');
    if (this.busy || this.child || this.pairChild || this.state.external) throw new Error('busy');
  }
  async pair(input) {
    this.assertAvailable();
    const data = validatePairing(input);
    this.busy = true;
    this.state.error = null;
    this.emit();
    let timer;
    let record;
    try {
      const child = this.spawnImpl(this.node, [this.cli, 'pair', '--server', data.server, '--name', data.name, '--config', this.config], {
        cwd: this.cwd, env: this.env, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'], shell: false,
      });
      record = watchChild(child);
      this.pairRecord = record;
      this.pairChild = child;
      record.done.then(() => {
        if (this.pairRecord === record) { this.pairChild = null; this.pairRecord = null; }
      });
      child.stdin.on('error', () => {});
      child.stdin.end(data.code + '\n');
      const result = await Promise.race([
        record.done,
        new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: true }), 65000); }),
      ]);
      if (result.timeout) {
        await terminate(record);
        throw new Error('pair_timeout');
      }
      if (this.closing) throw new Error('operation_cancelled');
      if (result.code !== 0) throw new Error('connection_failed');
      this.runnerId = JSON.parse(await this.readConfig()).runnerId;
      this.state = { ...this.state, paired: true, server: data.server, name: data.name, error: null };
    } catch (error) {
      const known = ['operation_cancelled', 'pair_timeout', 'stop_failed'];
      this.state.error = known.includes(error.message) ? error.message : 'connection_failed';
      throw new Error(this.state.error);
    } finally {
      clearTimeout(timer);
      if (!record || record.ended) { this.pairChild = null; this.pairRecord = null; }
      this.busy = false;
      this.emit();
    }
    return this.start();
  }
  start() {
    this.assertAvailable();
    if (!this.state.paired) throw new Error('not_paired');
    this.state.error = null;
    this.stopping = false;
    let child;
    try {
      child = this.spawnImpl(this.node, [this.cli, 'run', '--config', this.config], {
        cwd: this.cwd, env: this.env, windowsHide: true, stdio: ['ignore','pipe','ignore'], shell: false,
      });
    } catch {
      this.state.error = 'start_failed';
      this.emit();
      throw new Error('start_failed');
    }
    let pendingOutput='';
    child.stdout?.setEncoding?.('utf8');
    child.stdout?.on('data', chunk => {
      pendingOutput+=chunk.toString('utf8');
      if(pendingOutput.length>200000){pendingOutput='';return;}
      const lines=pendingOutput.split('\n');pendingOutput=lines.pop();
      for(const line of lines){
        let event;try{event=JSON.parse(line);}catch{continue;}
        if(event?.type!=='savia-activity'||typeof event.jobId!=='string'||event.jobId.length>100||typeof event.code!=='string'||event.code.length>100||!Number.isFinite(Date.parse(event.at)))continue;
        const details={};if(typeof event.details?.text==='string')details.text=event.details.text.slice(0,8000);for(const key of ['document','chapter','path','event','tool','callId'])if(typeof event.details?.[key]==='string')details[key]=event.details[key].slice(0,300);
        for(const key of ['page','totalPages','index','total','part','totalParts'])if(Number.isSafeInteger(event.details?.[key]))details[key]=event.details[key];
        const safe={jobId:event.jobId,code:event.code,at:event.at,details};
        this.state.activity=[...(this.state.activity||[]),safe].slice(-1000);
      }
      this.emit();
    });
    const record = watchChild(child);
    this.runRecord = record;
    this.child = child;
    this.busy = true;
    child.once('spawn', () => {
      if (this.child !== child || this.stopping || this.closing) return;
      this.busy = false;
      this.state.running = true;
      this.emit();
    });
    record.done.then(() => {
      if (this.child !== child) return;
      this.child = null;
      this.runRecord = null;
      if (!this.stopping && !this.closing) this.state.error = this.state.running ? 'runner_stopped' : 'start_failed';
      this.state.running = false;
      this.busy = false;
      this.emit();
    });
    this.emit();
    return this.snapshot();
  }
  stop() {
    if (this.stopPromise) return this.stopPromise;
    if (!this.runRecord) return Promise.resolve(this.snapshot());
    this.stopping = true;
    this.busy = true;
    this.emit();
    this.stopPromise = terminate(this.runRecord).then(() => this.snapshot()).catch(error => {
      this.state.error = 'stop_failed';
      throw error;
    }).finally(() => {
      this.busy = false;
      this.stopping = false;
      this.stopPromise = null;
      this.emit();
    });
    return this.stopPromise;
  }
  async shutdown() {
    this.closing = true;
    if (this.pairRecord) await terminate(this.pairRecord);
    await this.stop();
  }
}
module.exports = { ConnectorController, validatePairing };
