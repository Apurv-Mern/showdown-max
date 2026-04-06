const trimTrailingComma = (value: string) => value.replace(/,+\s*$/, '').trim();

const resolvePublicUrl = (value: string | undefined, fallback: string, key: string) => {
  const cleaned = trimTrailingComma(value || '');
  if (cleaned) return cleaned;

  if (typeof window !== 'undefined') {
    // Helps debug when NEXT_PUBLIC_* vars are not loaded by Next.
    console.warn(`[env] ${key} is missing. Falling back to ${fallback}`);
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

