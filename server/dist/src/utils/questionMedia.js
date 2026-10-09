const questionHasMp3 = (question) => {
  const type = String(question?.mediaType || '').toLowerCase();
  const url = String(question?.mediaUrl || '');
  if (type === 'mp3' || type.includes('audio')) return true;
  return /\.mp3(?:$|\?)/i.test(url);
};

const ROUND_TYPES_MUSIC = 'MUSIC';

/**
 * Music rounds and any question with an MP3 wait for the host Start Timer so the clip and
 * countdown begin together. Questions without audio auto-start the timer on present.
 */
const shouldWaitForHostAudioTimer = (round, question) =>
  String(round?.type || '').toUpperCase() === ROUND_TYPES_MUSIC || questionHasMp3(question);

module.exports = { questionHasMp3, shouldWaitForHostAudioTimer };
