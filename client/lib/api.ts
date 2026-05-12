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
 * Server cap for `/api/media/upload` — keep in sync with `mediaService.MAX_FILE_SIZE`
 * on the backend (50 MB). Used to short-circuit oversize uploads on the client and to
 * format the user-facing error message when the server rejects with HTTP 413.
 */
export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_UPLOAD_SIZE_LABEL = '50 MB';

/** Human-readable byte size, e.g. 73891734 → "70.5 MB" — used in upload error toasts. */
export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

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

  // 413 may arrive with a non-JSON body (e.g. a reverse proxy boilerplate page) when the
  // request body is rejected before reaching Fastify. Guard the JSON parse so we still
  // surface a clear toast in that case.
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const apiError = (data || {}) as Partial<ApiError>;
    const rawMessage = apiError.error || '';

    // Map the raw multipart-plugin / reverse-proxy 413 into something the admin can act on.
    // Server message arrives as "request file too large" (no size context); we substitute
    // the configured cap so the operator knows exactly which limit they hit.
    let friendlyMessage = rawMessage || 'Upload failed';
    if (response.status === 413 || /file too large|payload too large|FST_REQ_FILE/i.test(rawMessage)) {
      friendlyMessage = `File too large. Maximum allowed size is ${MAX_UPLOAD_SIZE_LABEL}.`;
    }

    clientLogger.error('api', 'Upload failed', {
      requestId,
      endpoint,
      url,
      status: response.status,
      durationMs: Date.now() - startedAt,
      error: friendlyMessage,
      rawError: rawMessage,
    });
    throw new Error(friendlyMessage);
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
