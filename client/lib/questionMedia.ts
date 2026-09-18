export const questionHasMp3 = (question?: {
  mediaType?: string | null;
  question?: { mediaType?: string | null };
} | null): boolean => {
  const nested = question && 'question' in question ? question.question?.mediaType : undefined;
  const type = question?.mediaType ?? nested;
  return String(type || '').toLowerCase() === 'mp3';
};

export const shouldWaitForHostAudioTimer = (
  roundType?: string | null,
  question?: { mediaType?: string | null; question?: { mediaType?: string | null } } | null,
): boolean => String(roundType || '').toUpperCase() === 'MUSIC' || questionHasMp3(question);
