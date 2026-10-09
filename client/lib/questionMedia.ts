export const isQuestionImageMedia = (
  mediaType?: string | null,
  mediaUrl?: string | null,
): boolean => {
  if (!mediaUrl) return false;
  const type = String(mediaType || '').toLowerCase();
  if (type === 'image' || type.includes('image')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(?:$|\?)/i.test(String(mediaUrl));
};

export const questionHasMp3 = (question?: unknown): boolean => {
  if (!question || typeof question !== 'object') return false;
  const row = question as {
    mediaType?: unknown;
    mediaUrl?: unknown;
    question?: { mediaType?: unknown; mediaUrl?: unknown } | null;
  };
  const type = String(row.mediaType ?? row.question?.mediaType ?? '').toLowerCase();
  const url = String(row.mediaUrl ?? row.question?.mediaUrl ?? '');
  if (type === 'mp3' || type.includes('audio')) return true;
  return /\.mp3(?:$|\?)/i.test(url);
};

export const questionMediaUrl = (question?: unknown): string => {
  if (!question || typeof question !== 'object') return '';
  const row = question as { mediaUrl?: unknown; question?: { mediaUrl?: unknown } | null };
  return String(row.mediaUrl ?? row.question?.mediaUrl ?? '').trim();
};

/** Venue MP3 preload / playback — music rounds or any attached audio clip. */
export const questionNeedsVenueMp3 = (
  roundType?: string | null,
  question?: unknown,
): boolean => {
  if (!questionMediaUrl(question)) return false;
  return shouldWaitForHostAudioTimer(roundType, question) || questionHasMp3(question);
};

/** Host must press Start Timer before countdown (+ MP3 on venue) for Music rounds or any MP3 question. */
export const shouldWaitForHostAudioTimer = (
  roundType?: string | null,
  question?: unknown,
): boolean =>
  String(roundType || '').toUpperCase() === 'MUSIC' || questionHasMp3(question);

/** Mute venue countdown tick while an MP3 clip is playing. */
export const shouldMuteVenueTimerSound = (
  roundType?: string | null,
  question?: unknown,
): boolean => shouldWaitForHostAudioTimer(roundType, question);
