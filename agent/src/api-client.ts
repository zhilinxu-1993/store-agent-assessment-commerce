/**
 * HTTP client for the store backend API.
 */

const BASE_URL = 'http://localhost:3000/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as { success: boolean; data?: T; error?: { message: string } };

  if (!res.ok) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }

  return json.data as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
};
