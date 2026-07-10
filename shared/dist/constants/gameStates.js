const GAME_STATES = Object.freeze({
  LOBBY: 'LOBBY',
  ROUND_INTRO: 'ROUND_INTRO',
  WAGER_COLLECTION: 'WAGER_COLLECTION',
  QUESTION: 'QUESTION',
  ROUND_END: 'ROUND_END',
  /** Final-round transition before the closing scoreboard ("That's the end of our gameshow"). */
  GAME_SHOW_END: 'GAME_SHOW_END',
  SCOREBOARD: 'SCOREBOARD',
  BREAK: 'BREAK',
  MINI_GAME: 'MINI_GAME',
  FINAL_WAGER: 'FINAL_WAGER',
  FINAL_RESULTS: 'FINAL_RESULTS',
});

module.exports = { GAME_STATES };
