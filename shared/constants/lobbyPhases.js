const LOBBY_PHASES = Object.freeze({
  REGISTRATION: 'registration',
  CODE_OF_CONDUCT: 'code_of_conduct',
  PRACTICE_QUESTION: 'practice_question',
});

const LOBBY_PHASE_ORDER = [
  LOBBY_PHASES.REGISTRATION,
  LOBBY_PHASES.CODE_OF_CONDUCT,
  // LOBBY_PHASES.PRACTICE_QUESTION,
];

module.exports = { LOBBY_PHASES, LOBBY_PHASE_ORDER };
