import { clearStoredAuth, getStoredToken } from './auth';
import { clientLogger } from './clientLogger';
import { PUBLIC_API_URL } from './env';

const API_URL = PUBLIC_API_URL;

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

interface ApiError {
  success: boolean;
  error: string;
  statusCode: number;
}

/**
 * Generic fetch wrapper for the backend API.
 * Automatically attaches JWT Bearer token from localStorage.
 */
export const apiFetch = async <T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> => {
  const url = `${API_URL}${endpoint}`;
  const token = getStoredToken();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Only set JSON content-type when there is a body. DELETE/GET with
  // Content-Type: application/json and no body is rejected by Express body parsers.
  const body = options.body;
  const hasBody =
    body !== undefined && body !== null && !(typeof body === 'string' && body.length === 0);
  if (hasBody && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  headers['x-request-id'] = requestId;

  clientLogger.info('api', 'API request started', {
    requestId,
    endpoint,
    url,
    method: options.method || 'GET',
  });

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (error) {
    clientLogger.error('api', 'API request failed before response', {
      requestId,
      endpoint,
      url,
      method: options.method || 'GET',
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unknown network error',
      online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
    });
    throw error;
  }

  if (response.status === 401) {
    if (typeof window !== 'undefined' && !endpoint.includes('/api/auth/')) {
      clearStoredAuth();
      const path = window.location.pathname;
      if (path.startsWith('/admin')) {
        window.location.href = '/admin/login';
      } else if (path.startsWith('/host')) {
        window.location.href = '/host/login';
      }
    }
  }

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    clientLogger.error('api', 'API request failed', {
      requestId,
      endpoint,
      url,
      method: options.method || 'GET',
      status: response.status,
      durationMs: Date.now() - startedAt,
      error: error.error || 'Request failed',
    });
    throw new Error(error.error || 'Request failed');
  }

  clientLogger.info('api', 'API request succeeded', {
    requestId,
    endpoint,
    url,
    method: options.method || 'GET',
    status: response.status,
    durationMs: Date.now() - startedAt,
  });

  return data as ApiResponse<T>;
};

/**
 * Upload a file via FormData. Attaches JWT token automatically.
 */
export const apiUpload = async <T>(
  endpoint: string,
  formData: FormData,
): Promise<ApiResponse<T>> => {
  const url = `${API_URL}${endpoint}`;
  const token = getStoredToken();
  const requestId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  headers['x-request-id'] = requestId;

  clientLogger.info('api', 'Upload started', { requestId, endpoint, url });

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    clientLogger.error('api', 'Upload failed', {
      requestId,
      endpoint,
      url,
      status: response.status,
      durationMs: Date.now() - startedAt,
      error: error.error || 'Upload failed',
    });
    throw new Error(error.error || 'Upload failed');
  }

  clientLogger.info('api', 'Upload succeeded', {
    requestId,
    endpoint,
    url,
    status: response.status,
    durationMs: Date.now() - startedAt,
  });

  return data as ApiResponse<T>;
};

export const api = {
  get: <T>(endpoint: string) => apiFetch<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) =>
    apiFetch<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) =>
    apiFetch<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) =>
    apiFetch<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => apiFetch<T>(endpoint, { method: 'DELETE' }),
};
