const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

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
 * Generic fetch wrapper for the backend API
 */
export const apiFetch = async <T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> => {
  const url = `${API_URL}${endpoint}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.error || 'Request failed');
  }

  return data as ApiResponse<T>;
};

export const api = {
  get: <T>(endpoint: string) => apiFetch<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) =>
    apiFetch<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) =>
    apiFetch<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) => apiFetch<T>(endpoint, { method: 'DELETE' }),
};
