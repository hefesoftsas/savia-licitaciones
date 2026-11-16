export function request<T = unknown>(url: string, options?: RequestInit & { json?: unknown }, fetcher?: typeof fetch): Promise<T>;
