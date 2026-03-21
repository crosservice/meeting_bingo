const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// In production, all API calls go through /api/* which Nginx proxies to NestJS.
// In development, calls go directly to the NestJS port (no prefix needed).
const API_PREFIX = typeof window !== 'undefined' && API_URL.includes('localhost') ? '' : '/api';

class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
  ) {
    super(`API error ${status}`);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_URL}${API_PREFIX}${path}`;

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // If unauthorized, try to refresh
  if (res.status === 401 && !path.includes('/auth/refresh')) {
    const refreshRes = await fetch(`${API_URL}${API_PREFIX}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshRes.ok) {
      // Retry the original request
      const retryRes = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!retryRes.ok) {
        const data = await retryRes.json().catch(() => ({}));
        throw new ApiError(retryRes.status, data);
      }

      return retryRes.json() as Promise<T>;
    }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { ApiError };
