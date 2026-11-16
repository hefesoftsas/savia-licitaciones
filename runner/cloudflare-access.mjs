export function accessHeaders(server, credentials) {
  if (!credentials) return {};
  const url = new URL(server);
  if (url.protocol !== 'https:' || !credentials.clientId || !credentials.clientSecret) {
    throw new Error('Las credenciales de Cloudflare Access requieren un servidor HTTPS y ambos valores.');
  }
  return {'CF-Access-Client-Id': credentials.clientId, 'CF-Access-Client-Secret': credentials.clientSecret};
}

export function createAccessFetch(server, credentials, originalFetch = globalThis.fetch) {
  const origin = new URL(server).origin;
  const access = accessHeaders(server, credentials);
  return (input, options = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== origin || !credentials) return originalFetch(input, options);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    for (const [key, value] of Object.entries(access)) headers.set(key, value);
    return originalFetch(input, {...options, headers, redirect:'error'});
  };
}
