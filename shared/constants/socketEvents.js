const SOCKET_EVENTS = Object.freeze({
  // Connection
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',

  // Player → Server
  JOIN_SESSION: 'join_session',
  LEAVE_SESSION: 'leave_session',
  SUBMIT_ANSWER: 'submit_answer',
  SUBMIT_WAGER: 'submit_wager',
  MINI_GAME_ACTION: 'mini_game_action',

  // Host → Server
  HOST_ACTION: 'host_action',
  START_GAME: 'start_game',
  NEXT_QUESTION: 'next_question',
  START_TIMER: 'start_timer',
  PAUSE_TIMER: 'pause_timer',
  REVEAL_ANSWER: 'reveal_answer',
  SHOW_SCOREBOARD: 'show_scoreboard',
  HIDE_SCOREBOARD: 'hide_scoreboard',
  START_BREAK: 'start_break',
  END_BREAK: 'end_break',
  LAUNCH_MINI_GAME: 'launch_mini_game',
  MINI_GAME_COMMAND: 'mini_game_command',
  END_MINI_GAME: 'end_mini_game',
  ADD_TEAM: 'add_team',
  REMOVE_TEAM: 'remove_team',
  EDIT_TEAM_SCORE: 'edit_team_score',
  ADVANCE_ROUND: 'advance_round',
  END_GAME: 'end_game',
  MUSIC_CONTROL: 'music_control',

  // Server → Client
  SESSION_STATE: 'session_state',
  /** Admin removed the session from the DB — all clients in the room should leave. */
  SESSION_DELETED: 'session_deleted',
  QUESTION_ACTIVE: 'question_active',
  TIMER_UPDATE: 'timer_update',
  TIMER_EXPIRED: 'timer_expired',
  ANSWER_REVEAL: 'answer_reveal',
  SCOREBOARD: 'scoreboard',
  SCOREBOARD_HIDDEN: 'scoreboard_hidden',
  TEAM_JOINED: 'team_joined',
  TEAM_REMOVED: 'team_removed',
  TEAM_UPDATED: 'team_updated',
  BREAK_START: 'break_start',
  BREAK_END: 'break_end',
  MINI_GAME_START: 'mini_game_start',
  MINI_GAME_READY: 'mini_game_ready',
  MINI_GAME_UPDATE: 'mini_game_update',
  MINI_GAME_REVEAL: 'mini_game_reveal',
  MINI_GAME_END: 'mini_game_end',
  ROUND_INTRO: 'round_intro',
  ROUND_END: 'round_end',
  GAME_END: 'game_end',
  PLAYER_ELIMINATED: 'player_eliminated',
  AUTO_REVEAL: 'auto_reveal',
  RESPONSE_COUNT: 'response_count',
  LIVE_RESPONSE_UPDATE: 'live_response_update',

  // Errors
  ERROR: 'error',
  JOIN_ERROR: 'join_error',
});

module.exports = { SOCKET_EVENTS };
