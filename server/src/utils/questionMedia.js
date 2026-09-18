const questionHasMp3 = (question) =>
  String(question?.mediaType || '').toLowerCase() === 'mp3';

const ROUND_TYPES_MUSIC = 'MUSIC';

/**
 * Music rounds and any question with an MP3 wait for the host to start the timer
 * so the clip and countdown begin together. Timer sound is muted on the venue.
 */
const shouldWaitForHostAudioTimer = (round, question) =>
  String(round?.type || '').toUpperCase() === ROUND_TYPES_MUSIC || questionHasMp3(question);

module.exports = { questionHasMp3, shouldWaitForHostAudioTimer };
