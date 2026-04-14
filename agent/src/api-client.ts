/**
 * Typed HTTP client for the store backend API.
 * All methods return the parsed JSON body or throw an ApiCallError
 * if the response is not 2xx.
 */

const BASE_URL = process.env.STORE_API_URL ?? 'http://localhost:3000/api';

export class ApiCallError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiCallError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as {
    success: boolean;
    data?: T;
    error?: { code: string; message: string };
  };

  if (!res.ok || !json.success) {
    const code = json.error?.code ?? 'UNKNOWN';
    const message = json.error?.message ?? `HTTP ${res.status}`;
    throw new ApiCallError(res.status, code, message);
  }

  return json.data as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
};
