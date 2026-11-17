export async function request(url, { json, headers: suppliedHeaders, ...options } = {}, fetcher = fetch) {
  const headers = new Headers(suppliedHeaders);
  if (json !== undefined) headers.set('content-type', 'application/json');
  const response = await fetcher(url, { ...options, headers, credentials: 'same-origin', ...(json === undefined ? {} : { body: JSON.stringify(json) }) });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    const details = await response.json().catch(() => null);
    message = details?.message || details?.error || message;
    const error = new Error(message);
    error.status = response.status;
    error.details = details;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
