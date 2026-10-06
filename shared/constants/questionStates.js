const QUESTION_STATES = Object.freeze({
  WAITING: 'WAITING',
  /** Host sees upcoming question; venue and players stay on prior screen until present. */
  PREVIEW: 'PREVIEW',
  ACTIVE: 'ACTIVE',
  REVEALED: 'REVEALED',
});

module.exports = { QUESTION_STATES };
