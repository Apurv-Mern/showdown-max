import { clearStoredAuth, getStoredToken } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

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

  const response = await fetch(url, {
    ...options,
    headers,
  });

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
    throw new Error(error.error || 'Request failed');
  }

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
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.error || 'Upload failed');
  }

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
