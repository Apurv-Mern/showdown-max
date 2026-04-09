import { clientLogger } from './clientLogger';

const trimTrailingComma = (value: string) => value.replace(/,+\s*$/, '').trim();

const resolvePublicUrl = (value: string | undefined, fallback: string, key: string) => {
  const cleaned = trimTrailingComma(value || '');
  if (cleaned) return cleaned;

  if (typeof window !== 'undefined') {
    const message =
      process.env.NODE_ENV === 'production'
        ? `${key} is missing in production. Using fallback ${fallback}`
        : `${key} is missing. Falling back to ${fallback}`;
    clientLogger.warn('env', message, { key, fallback });
  }
  return fallback;
};

export const PUBLIC_API_URL = resolvePublicUrl(
  process.env.NEXT_PUBLIC_API_URL,
  'http://localhost:5001',
  'NEXT_PUBLIC_API_URL',
);

export const PUBLIC_SOCKET_URL = resolvePublicUrl(
  process.env.NEXT_PUBLIC_SOCKET_URL,
  'http://localhost:5001',
  'NEXT_PUBLIC_SOCKET_URL',
);

if (typeof window !== 'undefined') {
  clientLogger.info('env', 'Resolved public URLs', {
    apiUrl: PUBLIC_API_URL,
    socketUrl: PUBLIC_SOCKET_URL,
  });
}
