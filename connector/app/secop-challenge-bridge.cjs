const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');

const SECOP_CHALLENGE_ORIGIN = 'https://community.secop.gov.co';
const DEFAULT_MAX_BODY_BYTES = 16 * 1024;

function isValidSecopChallengeUrl(targetUrl) {
  if (typeof targetUrl !== 'string' || !targetUrl) return false;
  try {
    const parsed = new URL(targetUrl);
    return parsed.origin === SECOP_CHALLENGE_ORIGIN && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

async function startSecopChallengeBridge({ openWindow, maxBodyBytes = DEFAULT_MAX_BODY_BYTES }) {
  const token = randomBytes(32).toString('hex');
  let challengeQueue = Promise.resolve();
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/secop-challenge' || req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
      return;
    }
    const chunks = [];
    let totalBytes = 0;
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBodyBytes) {
        tooLarge = true;
        res.writeHead(413, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'payload_too_large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { body = null; }
      const targetUrl = typeof body?.url === 'string' ? body.url : '';
      if (!isValidSecopChallengeUrl(targetUrl)) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid_url' }));
        return;
      }
      const abort = new AbortController();
      res.on('close', () => { if (!res.writableEnded) abort.abort(); });
      const run = challengeQueue.then(() => openWindow({ url: targetUrl, title: body?.title, signal: abort.signal }));
      challengeQueue = run.catch(() => undefined);
      run.then(result => {
        if (res.writableEnded) return;
        res.writeHead(result.ok ? 200 : 499, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      });
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, token, server };
}

module.exports = {
  DEFAULT_MAX_BODY_BYTES,
  isValidSecopChallengeUrl,
  startSecopChallengeBridge,
};
