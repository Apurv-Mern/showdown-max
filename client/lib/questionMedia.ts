export const questionHasMp3 = (question?: unknown): boolean => {
  if (!question || typeof question !== 'object') return false;
  const row = question as {
    mediaType?: unknown;
    question?: { mediaType?: unknown } | null;
  };
  const type = row.mediaType ?? row.question?.mediaType;
  return String(type || '').toLowerCase() === 'mp3';
};

export const shouldWaitForHostAudioTimer = (
  roundType?: string | null,
  question?: unknown,
): boolean => String(roundType || '').toUpperCase() === 'MUSIC' || questionHasMp3(question);
