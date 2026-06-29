import { PUBLIC_API_URL } from '@/lib/env';

/** Browser-safe media URL for <img>, <video>, and <audio> (no auth headers). */
export function toPublicMediaPreviewUrl(mediaUrl?: string | null): string {
  if (!mediaUrl) return '';
  const normalized = mediaUrl
    .replace(/\\/g, '/')
    .replace('/api/media/files/', '/api/public/media/files/')
    .trim();
  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:')
  ) {
    return normalized;
  }
  if (normalized.startsWith('/')) {
    return `${PUBLIC_API_URL}${normalized}`;
  }
  return `${PUBLIC_API_URL}/${normalized}`;
}
