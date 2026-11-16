const MAX_REDIRECTS = 5;

// Follow same-origin redirects only: credentials and private request bodies must
// never be forwarded to a different origin, including HTTPS-to-HTTP downgrades.
async function fetchWithRedirect(url, init = {}, fetchImpl = fetch) {
  let currentUrl = String(url);
  let currentInit = { ...init, redirect: 'manual' };
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetchImpl(currentUrl, currentInit);
    const location = response.headers.get('location');
    if (response.status < 301 || response.status > 308 || response.status === 304 || !location || redirects >= MAX_REDIRECTS) {
      return response;
    }
    const nextUrl = new URL(location, currentUrl);
    if (nextUrl.origin !== new URL(currentUrl).origin) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Cross-origin redirect rejected');
    }
    const method = String(currentInit.method || 'GET').toUpperCase();
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
      const { body, ...rest } = currentInit;
      currentInit = { ...rest, method: 'GET' };
    }
    await response.body?.cancel().catch(() => undefined);
    currentUrl = nextUrl.href;
  }
}

module.exports = { fetchWithRedirect };
