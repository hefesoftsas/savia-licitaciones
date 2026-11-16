const test = require('node:test');
const assert = require('node:assert/strict');
const { startSecopChallengeBridge, isValidSecopChallengeUrl } = require('../app/secop-challenge-bridge.cjs');

test('isValidSecopChallengeUrl allows only https://community.secop.gov.co origin without credentials', () => {
  assert.equal(isValidSecopChallengeUrl('https://community.secop.gov.co/PublicTendering/OpportunityDetail/Index'), true);
  assert.equal(isValidSecopChallengeUrl('https://community.secop.gov.co'), true);
  assert.equal(isValidSecopChallengeUrl('http://community.secop.gov.co/test'), false);
  assert.equal(isValidSecopChallengeUrl('https://community.secop.gov.co.evil.example/test'), false);
  assert.equal(isValidSecopChallengeUrl('https://community.secop.gov.co:8443/test'), false);
  assert.equal(isValidSecopChallengeUrl('https://user:pass@community.secop.gov.co/test'), false);
  assert.equal(isValidSecopChallengeUrl('not-a-url'), false);
  assert.equal(isValidSecopChallengeUrl(''), false);
});

test('secop challenge bridge enforces auth, origin check, and body size limit', async () => {
  const opened = [];
  const bridge = await startSecopChallengeBridge({
    maxBodyBytes: 256,
    openWindow: async ({ url, title }) => {
      opened.push({ url, title });
      return { ok: true, cookieHeader: 'sid=1' };
    },
  });

  try {
    const unauthorized = await fetch(`${bridge.url}/secop-challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://community.secop.gov.co/doc' }),
    });
    assert.equal(unauthorized.status, 403);

    const badOrigin = await fetch(`${bridge.url}/secop-challenge`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${bridge.token}`,
      },
      body: JSON.stringify({ url: 'https://community.secop.gov.co.evil.example/doc' }),
    });
    assert.equal(badOrigin.status, 400);
    assert.deepEqual(await badOrigin.json(), { ok: false, error: 'invalid_url' });

    const oversized = await fetch(`${bridge.url}/secop-challenge`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${bridge.token}`,
      },
      body: JSON.stringify({ url: 'https://community.secop.gov.co/doc', title: 'x'.repeat(512) }),
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), { ok: false, error: 'payload_too_large' });

    const valid = await fetch(`${bridge.url}/secop-challenge`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${bridge.token}`,
      },
      body: JSON.stringify({ url: 'https://community.secop.gov.co/doc', title: 'Doc' }),
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { ok: true, cookieHeader: 'sid=1' });
    assert.deepEqual(opened, [{ url: 'https://community.secop.gov.co/doc', title: 'Doc' }]);
  } finally {
    await new Promise(resolve => bridge.server.close(resolve));
  }
});
